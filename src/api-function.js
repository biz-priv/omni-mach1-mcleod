const AWS = require('aws-sdk');
const request = require('request');
const moment = require('moment-timezone');
const { putItem, updateItem } = require('./shared/dynamodb');
const { v4: uuidv4 } = require("uuid");
const { getTimeZonePort } = require('./shared/helper');
var dynamodb = new AWS.DynamoDB.DocumentClient();

module.exports.handler = async (event, context) => {
    let unprocessedRecords = await queryUnprocessedRecords();
    console.log( unprocessedRecords );

    let promises = unprocessedRecords.map( item => processRecord(item) );
    let resultArr =  await Promise.all( promises );
    console.log( "Promise All Result", resultArr );
}

async function queryUnprocessedRecords() {
    let params = {
        TableName : process.env.MACH1_MALEOD_TABLE,
        IndexName : "processed-index",
        KeyConditionExpression: "#processedAttribute = :processedValue",
        ExpressionAttributeNames: {
            "#processedAttribute": "processed"
        },
        ExpressionAttributeValues: {
            ":processedValue": 'false'
        }
    }
    let result = await dynamodb.query(params).promise();
    return result.Items;
}

async function processRecord( item ) {
    let promiseResponse = {
        success : false,
        itemId : item.CONSOL_NBR
    }
    try {

        //TODO - Check if ShipmentCount > 0 and mcleod id is empty, don't process
        //TODO - Check if ShipmentCount > 0 and mcleod id is empty, call create, and update the process flag
        //TODO - Check if ShipmentCount > 0 and mcleod id is not empty, call update, and update the process flag
        //TODO - ShipmentCount > 0 and mcleod id is not empty, call the void api, and update the process flag

        let getNewOrderPayload = generatePayloadForGetNewOrder(item)
        let getNewOrderResponse = await getNewOrder(getNewOrderPayload);

        let logObj = {
            id: uuidv4(),
            CONSOL_NBR : item.CONSOL_NBR,
            request_json : getNewOrderPayload,
            response_json : getNewOrderResponse,
            api_status_code : getNewOrderResponse.statusCode,
            api_endpoint : "GET ORDER",
            inserted_time_stamp : moment.tz("America/Chicago").format("YYYY-MM-DD HH:mm:ss").toString()
        }
        await putItem(process.env.MALEOD_API_LOG_TABLE, logObj);

        if ( getNewOrderResponse.statusCode < 200 || getNewOrderResponse.statusCode >= 300 ) {
            console.log( `Error for ${item.CONSOL_NBR}`, getNewOrderResponse.body );
            return promiseResponse;   
        }

        let createNewOrderPayload = await generatePayloadForCreateOrder( getNewOrderResponse, item );
        let createNewOrderResponse = await postNewOrder(createNewOrderPayload);

        logObj = {
            id: uuidv4(),
            CONSOL_NBR : item.CONSOL_NBR,
            request_json : createNewOrderPayload,
            response_json : createNewOrderResponse,
            api_status_code : getNewOrderResponse.statusCode,
            api_endpoint : "PUT ORDER",
            inserted_time_stamp : moment.tz("America/Chicago").format("YYYY-MM-DD HH:mm:ss").toString()
        }
        await putItem(process.env.MALEOD_API_LOG_TABLE, logObj);;

        if ( createNewOrderResponse.statusCode < 200 || createNewOrderResponse.statusCode >= 300 ) {
            console.log( `Error for ${item.CONSOL_NBR}`, createNewOrderResponse.body );
            return promiseResponse;   
        }
    
        await markRecordAsProcessed(item.CONSOL_NBR, createNewOrderResponse.body.id)
        // await putItem( process.env.MACH1_MALEOD_TABLE, { ...item, processed : 'true' } );
        promiseResponse.success = true;
    } catch( e ) {
        console.log( `Error for ${item.CONSOL_NBR}`, e )
    }

    return promiseResponse;
}

function generatePayloadForGetNewOrder(item) {
    return {
        "__name": "orders",
        "company_id": "TMS",
        "stops": [{
            "__name": "stops",
            "company_id": "TMS",
            "city": item.ORIGIN_CITY, 
            "state": item.ORIGIN_ST, 
            "location_id": item.ORIGIN_LOC_ID, 
            "order_sequence": 1
        },
        {
            "__name": "stops",
            "company_id": "TMS",
            "city": item.DESTINATION_CITY,
            "state": item.DESTINATION_ST,
            "location_id": item.DESTINATION_LOC_ID,
            "order_sequence": 2
        }]
    }
}

async function getNewOrder(bodyPayload) {
    process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;
    let options = {
        uri: process.env.MALEOD_API_ENDPOINT + "new",
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.MALEOD_API_TOKEN}`
        },
        json : bodyPayload
    };
    return new Promise((resolve, reject) => {
        request(options, function (err, data, body) {
            if (err) {
                console.log("Error", err);
                reject(err);
            } else {
                console.log("Get Orders response : ", body );
                resolve({ statusCode : data.statusCode, body });
            }
        });
    });
}

async function generatePayloadForCreateOrder(getOrderResponse, item) {
    let orderDetails = { ...getOrderResponse };

    orderDetails.blnum = item.CONSOL_NBR;
    orderDetails.collection_method = "P";
    orderDetails.customer_id = "MACH1LIN";
    orderDetails.pallets_how_many = item.PACKS;
    orderDetails.pieces = item.PACKS;
    orderDetails.weight = item.CHARGEABLE_WEIGHT;

    if ( item.ORIGIN_PORT ) {
        let originTimeZone = await getTimeZonePort(item.ORIGIN_PORT.substring(2));
        if ( originTimeZone ) {
            orderDetails.stops[0].city = item.ORIGIN_CITY;
            orderDetails.stops[0].state = item.ORIGIN_ST;
            orderDetails.stops[0].location_id = item.ORIGIN_LOC_ID;
            orderDetails.stops[0].order_sequence = 1;
            orderDetails.stops[0].sched_arrive_early = moment.tz(item.ETD, originTimeZone.TzTimeZone).format( 'YYYYMMDDHHmmssZZ');
            orderDetails.stops[0].sched_arrive_late = moment.tx(item.ETD, originTimeZone.TzTimeZone).format('YYYYMMDDHHmmssZZ');
        }
    }

    if ( item.DESTINATION_PORT ) {
        let destTimeZone = await getTimeZonePort(item.DESTINATION_PORT.substring(2));
        if ( destTimeZone ) {
            orderDetails.stops[1].city = item.DESTINATION_CITY;
            orderDetails.stops[1].state = item.DESTINATION_ST;
            orderDetails.stops[1].location_id = item.DESTINATION_LOC_ID;
            orderDetails.stops[1].order_sequence = 2;
            orderDetails.stops[0].sched_arrive_early = moment.tz(item.ETA, destTimeZone.TzTimeZone).format( 'YYYYMMDDHHmmssZZ');
            orderDetails.stops[0].sched_arrive_late = moment.tx(item.ETA, destTimeZone.TzTimeZone).format('YYYYMMDDHHmmssZZ');
        }
    }

    orderDetails.freightGroup.pro_nbr = item.CONSOL_NBR;
    orderDetails.freightGroup.total_chargeable_weight = item.CHARGEABLE_WEIGHT;
    orderDetails.freightGroup.total_handling_units = item.PACKS;
    orderDetails.freightGroup.total_pieces = item.PACKS;
    orderDetails.freightGroup.total_req_spots = item.PACKS;
    orderDetails.freightGroup.total_weight = item.CHARGEABLE_WEIGHT;
    orderDetails.freightGroup.weight_uom_type_code = "LBS";

    orderDetails.freightGroup.freightGroupItems = [{
        "__type": "freight_group_item",
        "__name": "freightGroupItems",
        "company_id": "TMS",
        "add_timestamp": moment().format('YYYYMMDDHHmmssZZ'),
        "add_userid": "lmeadm",
        "fgi_sequence_nbr": 1,
        "handling_units": item.PACKS,
        "pieces": item.PACKS,
        "req_spots": item.PACKS,
        "weight": item.CHARGEABLE_WEIGHT,
        "weight_uom_type_code": "LBS"
    }];
    
    return orderDetails;
}

async function postNewOrder(bodyPayload) {
    let options = {
        uri: process.env.MALEOD_API_ENDPOINT + "create",
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.MALEOD_API_TOKEN}`
        },
        json : bodyPayload
    };
    return new Promise((resolve, reject) => {
        request(options, function (err, data, body) {
            if (err) {
                console.log("Error", err);
                reject(err);
            } else {
                console.log( "Create Order Response", body );
                console.log( "Create Order Status Code", data.statusCode );
                resolve({ statusCode : data.statusCode, body });
            }
        });
    });
}

async function markRecordAsProcessed(CONSOL_NBR, mcleodId = null ) {
    let attributes = {
        ":processed": true,
        ":dateUpdated": moment().toISOString()
    }
    if ( mcleodId ) {
        attributes[":mcleodId"] = mcleodId
    }
    let params = {
        TableName: process.env.MACH1_MALEOD_TABLE,
        Key: {
            CONSOL_NBR: CONSOL_NBR
        },
        UpdateExpression: `set processed = :processed ${ mcleodId ? ', mcleodId= :mcleodId' : '' } `,
        ExpressionAttributeValues: attributes
    }
    await updateItem(params);
}