const {getLocation, getZipcode, updateOrder, getOrders} = require("./shared/mcleod-api-helper")
const {getZipcodeFromGoogle} = require("./shared/google-api-helper")

const loop_count = 1;

module.exports.handler = async (event, context) => {
  console.log("EVENT:", event);

  try {
    let orders = [];
    let getOrdersResponse = await getOrders();

    if (
      getOrdersResponse.statusCode < 200 ||
      getOrdersResponse.statusCode >= 300
    ) {
      console.log(`Error`, getOrdersResponse.body);
      return orders;
    }

    orders = JSON.parse(getOrdersResponse.body);
    console.log("Orders Length - ", orders.length);

    let processedRecords = 0, y;
    for (y = 0; processedRecords < loop_count && y < orders.length ; y++) {
        console.log(orders[y]);
        var order_id = orders[y].id;
        var length = orders[y].stops.length;
        
        var pickup_stop_id = orders[y].stops[0].location_id;
        var del_stop_id = orders[y].stops[length-1].location_id;

        if ( (!pickup_stop_id || !del_stop_id) && length >= 4 ) {
            if ( length == 6 ) {
                console.log(`Attempting to update ${order_id}, 6 stops`);
                await update_order_six_stops(orders[y]);
            } else {
                console.log(`Attempting to update ${order_id}, 4 stops`);
                await update_order_four_stops(orders[y]);
            }
            processedRecords++;
        } else {
          console.log(`No need to update ${order_id}`);
        }
    }

    if (orders.length - y > 0) {
        return { hasMoreData: "true" };
    } else {
        return { hasMoreData: "false" };
    }
  } catch (e) {
    console.log(e);
  }

  return {hasMoreData : "false"};
};

async function update_order_six_stops(order) {
    let pickup_stops = order.stops.slice(0,3);
    let delivery_stops = order.stops.slice(3,6);


    console.log("pickup_stops", pickup_stops);
    pickup_stops = await update_stops(pickup_stops);
    console.log("pickup_stops", pickup_stops);
    
    delivery_stops = await update_stops(delivery_stops.reverse());

    let update_payload = {
        __name: "orders",
        __type: "orders",
        company_id: "TMS",
        id: order.id,
        stops: [...pickup_stops, ...delivery_stops.reverse()]
    }
    console.log("update_payload", update_payload);

    // let update_stops_response = await updateOrder(update_payload);
    
    // if ( update_stops_response.statusCode < 200 || update_stops_response.statusCode >= 300) {
    //     console.log(`Error updating ${order.id}`, update_stops_response.body);
    // } else {
    //     console.log(`Success updating ${order.id}`);
    // }
}

async function update_order_four_stops(order) {
    let pickup_stops = order.stops.slice(0,1);
    let delivery_stops = order.stops.slice(2,3);

    pickup_stops = await update_stops(pickup_stops);
    delivery_stops = await update_stops(delivery_stops.reverse());

    let update_payload = {
        __name: "orders",
        __type: "orders",
        company_id: "TMS",
        id: order.id,
        stops: [...pickup_stops, ...delivery_stops.reverse()]
    }
    console.log("update_payload", update_payload);

    // let update_stops_response = await updateOrder(update_payload);
    
    // if ( update_stops_response.statusCode < 200 || update_stops_response.statusCode >= 300) {
    //     console.log(`Error updating ${order.id}`, update_stops_response.body);
    // } else {
    //     console.log(`Success updating ${order.id}`);
    // }
}

async function update_stops( stops ) {
    
    let updated_stops = [];
    updated_stops = stops.map( item => { return {
        __type: "stop",
        __name: "stops",
        company_id: "TMS",
        id: item.id,
        order_sequence: item.order_sequence
    }});

    let location_id = stops[0].location_id; 
    
    if ( !location_id ) {
        let {address, city_name, state, zip_code, location_name} = stops[0];
        if ( !location_name ) {
            location_name = city_name;
        }

        if ( !zip_code ) {
            zip_code = await getZipcodeFromGoogle(`${address},${city_name},${state}`);
            console.log("Zipcode from Google : ", zip_code);
        }

        let zipcode_response = await getZipcode(zip_code);

        if ( zipcode_response.statusCode < 200 || zipcode_response.statusCode >= 300) {
            console.log(`Error`, zipcode_response.body);
            return updated_stops
        }

        let zipcodes = JSON.parse( zipcode_response.body );
        if (zipcodes)  {
            for (let index = 0; index < zipcodes.length; index++) {
                const element = zipcodes[index];
                if ( element.rxz_type_code == 'OPER' ) {
                    let reg_uid = element.reg_uid_row.reg_uid;
    
                    let get_location_response = await getLocation(reg_uid);
    
                    if ( get_location_response.statusCode < 200 || get_location_response.statusCode >= 300) {
                        console.log(`Error`, get_location_response.body);
                        return updated_stops
                    }
    
                    let locations = JSON.parse(get_location_response.body);
    
                    for (let index2 = 0; index2 < locations.length; index2++) {
                        const element1 = locations[index2];
                        if ( element1.location_id[0] == "O") {
                            location_id = element1.location_id;
                        }
                    }
                }
            }
    
            updated_stops[0] = {
                ...updated_stops[0],
                showas_address: address,
                showas_address2: `${city_name} ${state} ${zip_code}`,
                showas_location_name: location_name
            }
        }
    }

    if ( location_id ) {
        updated_stops = updated_stops.map( item => { return {
            ...item,
            location_id
        }});
    }

    return updated_stops;
}