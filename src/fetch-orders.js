const {getRegion, getZipcode, updateOrder, getOrdersWithoutConsignee, getOrdersWithoutShipper} = require("./shared/mcleod-api-helper")
const {getZipcodeFromGoogle} = require("./shared/google-api-helper")
const moment = require('moment-timezone');
const AWS = require('aws-sdk');
const { v4: uuidv4 } = require("uuid");
const { putItem } = require('./shared/dynamodb');

const loop_count = 10;
var errors = []

const DATE_FORMAT = "YYYY-MM-DD HH:mm:ss"
const logFrequency = {
    "prod" : 2,
    "uat" : 30,
    "dev" : 30
}

module.exports.handler = async (event, context) => {
  console.log("EVENT:", event);

  try {
    let orders = [];
    errors = event.errors ?? [];
    let isConsignee = event.isConsignee ?? false;
    let getOrdersResponse = isConsignee ? await getOrdersWithoutConsignee() : await getOrdersWithoutShipper();

    if (
      getOrdersResponse.statusCode < 200 ||
      getOrdersResponse.statusCode >= 300
    ) {
      console.log(`Error`, getOrdersResponse);
      errors.push(`Error in fetching orders - ${JSON.stringify(getOrdersResponse)}`);
    //   return orders;
    }

    orders = getOrdersResponse.body ? JSON.parse(getOrdersResponse.body) : [];
    console.log("Orders Length - ", orders.length);

    let processedRecords = 0, index = event.index ?? 0;
    for (; processedRecords < loop_count && index < orders.length ; index++) {
        console.log(orders[index]);
        var order_id = orders[index].id;
        var length = orders[index].stops.length;
        
        orders[index].stops = arrangeStops(orders[index].stops);

        try {
            var pickup_stop_id = orders[index].stops[0].location_id;
            var del_stop_id = orders[index].stops[length-1].location_id;
    
            if ( (!pickup_stop_id || !del_stop_id) && length >= 4 ) {
                processedRecords++;
                if ( length == 6 ) {
                    console.log(`Attempting to update ${order_id}, 6 stops`);
                    await update_order_six_stops(orders[index]);
                } else {
                    console.log(`Attempting to update ${order_id}, 4 stops`);
                    await update_order_four_stops(orders[index]);
                }
            } else {
              console.log(`No need to update ${order_id}`);
            }
        } catch(e) {
            errors.push(`Error updating ${order_id} - ${e}`);
            console.log(`Error updating ${order_id}`)
        }
    }

    if (orders.length - index > 0) {
        return { hasMoreData: "true", index, isConsignee, errors };
    } else {
        console.log("errors", errors)
        if ( !isConsignee ) {
            return { hasMoreData: "true", index : 0, isConsignee : true, errors };
        } else {
            await saveErrors()
            await sendMessageToSNS()
        }
        return { hasMoreData: "false", index, isConsignee, errors };
    }
  } catch (e) {
    console.log(e);
  }

  return {hasMoreData : "false"};
};

function arrangeStops(stops) {
    let updated_stops_sequence = [];
    stops.forEach(stop => {
        updated_stops_sequence[stop.order_sequence-1] = stop
    });
    return updated_stops_sequence;
}

async function update_order_six_stops(order) {
    let pickup_stops = order.stops.slice(0,3);
    let delivery_stops = order.stops.slice(3,6);

    let updated_pickup_stops = await update_stops(pickup_stops);    
    let updated_delivery_stops = await update_stops(delivery_stops.reverse());
    
    if ( updated_pickup_stops.region_found || updated_delivery_stops.region_found ) {
        let update_payload = {
            __name: "orders",
            __type: "orders",
            company_id: "TMS",
            id: order.id,
            stops: [...updated_pickup_stops.updated_stops, ...updated_delivery_stops.updated_stops.reverse()]
        }
        console.log("update_payload", update_payload);
    
        let update_stops_response = await updateOrder(update_payload);
        
        if ( update_stops_response.statusCode < 200 || update_stops_response.statusCode >= 300) {
            errors.push(`Error updating ${order.id} - ${JSON.stringify(update_stops_response)}`);
            console.log(`Error updating ${order.id}`, update_stops_response.body);
        } else {
            console.log(`Success updating ${order.id}`);
        }
    } else {
        console.log( `pickup_region_found - ${updated_pickup_stops.region_found}, delivery_region_found - ${updated_delivery_stops.region_found}` );
    }

}

async function update_order_four_stops(order) {
    let pickup_stops = order.stops.slice(0,3);
    let delivery_stops = order.stops.slice(3,4);

    let updated_pickup_stops = await update_stops(pickup_stops);    
    let updated_delivery_stops = await update_stops(delivery_stops.reverse());
    
    if ( updated_pickup_stops.region_found || updated_delivery_stops.region_found ) {
        let update_payload = {
            __name: "orders",
            __type: "orders",
            company_id: "TMS",
            id: order.id,
            stops: [...updated_pickup_stops.updated_stops, ...updated_delivery_stops.updated_stops.reverse()]
        }
        console.log("update_payload", update_payload);
    
        let update_stops_response = await updateOrder(update_payload);
        
        if ( update_stops_response.statusCode < 200 || update_stops_response.statusCode >= 300) {
            errors.push(`Error updating ${order.id} - ${JSON.stringify(update_stops_response)}`);
            console.log(`Error updating ${order.id}`, update_stops_response.body);
        } else {
            console.log(`Success updating ${order.id}`);
        }
    } else {
        console.log( `pickup_region_found - ${updated_pickup_stops.region_found}, delivery_region_found - ${updated_delivery_stops.region_found}` );
    }
}

async function update_stops( stops ) {
    
    let updated_stops = [];
    let region_found = false;
    updated_stops = stops.map( item => { return {
        __type: "stop",
        __name: "stops",
        company_id: "TMS",
        id: item.id,
        order_sequence: item.order_sequence
    }});

    let location_id = stops[0].location_id; 
    
    if ( !location_id ) {
        let {address, city_id, city_name, state, zip_code, location_name} = stops[0];
        if ( !location_name ) {
            location_name = city_name;
        }

        if ( !zip_code ) {
            zip_code = await getZipcodeFromGoogle(`${address},${city_name},${state}`);
            console.log("Zipcode from Google : ", zip_code);
        }

        let zipcode_response = await getZipcode(zip_code);
        console.log("zipcode_response", zipcode_response)

        if ( zipcode_response.statusCode < 200 || zipcode_response.statusCode >= 300) {
            console.log(`Error`, zipcode_response.body);
            throw new Error(JSON.stringify(zipcode_response))
            // return {updated_stops, region_found}
        }

        let zipcodes = JSON.parse( zipcode_response.body ) ?? [];
        if (zipcodes)  {
            for (let index = 0; index < zipcodes.length; index++) {
                const element = zipcodes[index];
                var expiry_date = moment(element.expire_timestamp, ["YYYYMMDDHHmmss"]);
                
                if ( element.rxz_type_code == 'OPER' && ( !expiry_date.isValid() || expiry_date.isAfter() ) ) {
                    let reg_uid = element.reg_uid_row.reg_uid;
    
                    let get_location_response = await getRegion(reg_uid);
    
                    if ( get_location_response.statusCode < 200 || get_location_response.statusCode >= 300) {
                        console.log(`Error`, get_location_response.body);
                        throw new Error(JSON.stringify(get_location_response))
                        // return updated_stops
                    }
    
                    let locations = JSON.parse(get_location_response.body) ?? [];
    
                    for (let index2 = 0; index2 < locations.length; index2++) {
                        const element1 = locations[index2];
                        // if ( element1.location_id[0] == "O") {
                        location_id = element1.location_id;
                        region_found = true;
                        break;
                        // }
                    }
                    if (region_found) {
                        break;
                    }
                 }
            }
    

            updated_stops[0] = {
                "__type": stops[0].__type,
                "__name": stops[0].__name,
                "company_id": stops[0].company_id,
                "id": stops[0].id,
                "location_id": location_id,
                "order_sequence": stops[0].order_sequence,
                "sched_arrive_early": stops[0].sched_arrive_early
            }

            if ( "sched_arrive_late" in stops[0] ) { updated_stops[0].sched_arrive_late = stops[0].sched_arrive_late }
            if ( "address" in stops[0] ) { updated_stops[0].showas_address = stops[0].address }
            if ( "location_name" in stops[0] ) { updated_stops[0].showas_location_name = stops[0].location_name }
            if ( "city_name" in stops[0] ) { updated_stops[0].showas_city_name = stops[0].city_name }
            if ( "city_id" in stops[0] ) { updated_stops[0].showas_city_id = stops[0].city_id }
            if ( "state" in stops[0] ) { updated_stops[0].showas_state = stops[0].state }
            if ( "zip_code" in stops[0] ) { updated_stops[0].showas_zip_code = stops[0].zip_code }

        }
    }

    return {updated_stops, region_found};
}

async function sendMessageToSNS( ) {

    let endTime = moment()
    let errorRecords = getErrors( endTime.subtract(1,'h').format(DATE_FORMAT), endTime.format(DATE_FORMAT) )
    console.log("errorRecords", errorRecords);

    if ( errors.length > 0 ) {

        // let message = `
        // The following api calls failed during the last execution
        // ${errors.join('\n\t')}
        // `

        // var params = {
        //     Message: message,
        //     TopicArn: process.env.LOCATION_UPDATE_TOPIC_ARN,
        //     Subject: `${process.env.API_ENVIRONMENT.toUpperCase()} - Location Update Failures`
        // };
        // var publishTextPromise = new AWS.SNS({apiVersion: '2010-03-31'}).publish(params).promise();
    
        // await publishTextPromise.then().catch(
        //     function(err) {
        //     console.error(err, err.stack);
        //   });
    }
}

async function saveErrors() {
    if ( errors.length > 0 ) {
        let logObj = {
            id: uuidv4(),
            errors : errors,
            inserted_time_stamp : moment.tz("America/Chicago").format(DATE_FORMAT).toString()
        }
        await putItem(process.env.LOCATION_ERRORS_TABLE, logObj);
    }
}

async function getErrors(startDate, endDate) {
    try {
      const documentClient = new AWS.DynamoDB.DocumentClient({
        region: process.env.REGION,
      });
      const params = {
        TableName: process.env.LOCATION_ERRORS_TABLE,
        FilterExpression: "#Timestamp BETWEEN :StartDate AND :EndDate ",
        ExpressionAttributeNames: { "#Timestamp": "inserted_time_stamp" },
        ExpressionAttributeValues: {
          ":StartDate": startDate,
          ":EndDate": endDate,
        },
      };
      const response = await documentClient.scan(params).promise();
      return response.Items;
    } catch (e) {
      throw e.hasOwnProperty("message") ? e.message : e;
    }
  }
  