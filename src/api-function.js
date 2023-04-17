const AWS = require('aws-sdk');
const request = require('request');
const moment = require('moment-timezone');
const { putItem } = require('./shared/dynamodb');
const { v4: uuidv4 } = require("uuid");
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
            return processRecord;   
        }

        let createNewOrderPayload = generatePayloadForCreateOrder( orderDetails, item );
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
            return processRecord;   
        }
    
        await putItem( process.env.MACH1_MALEOD_TABLE, { ...item, processed : 'true' } );
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

function generatePayloadForCreateOrder(getOrderResponse, item) {
    let orderDetails = { ...getOrderResponse };

    orderDetails.blnum = item.CONSOL_NBR;
    orderDetails.collection_method = "P";
    orderDetails.customer_id = "MACH1LIN";
    orderDetails.pallets_how_many = item.PACKS;
    orderDetails.pieces = item.PACKS;
    orderDetails.weight = item.CHARGEABLE_WEIGHT;

    orderDetails.stops[0].city = item.ORIGIN_CITY;
    orderDetails.stops[0].state = item.ORIGIN_ST;
    orderDetails.stops[0].location_id = item.ORIGIN_LOC_ID;
    orderDetails.stops[0].order_sequence = 1;
    orderDetails.stops[0].sched_arrive_early = moment(item.ETA).format('YYYYMMDDHHmmssZZ');
    orderDetails.stops[0].sched_arrive_late = moment(item.ETA).format('YYYYMMDDHHmmssZZ');

    orderDetails.stops[1].city = item.DESTINATION_CITY;
    orderDetails.stops[1].state = item.DESTINATION_ST;
    orderDetails.stops[1].location_id = item.DESTINATION_LOC_ID;
    orderDetails.stops[1].order_sequence = 2;
    orderDetails.stops[1].sched_arrive_early = moment(item.ETA).format('YYYYMMDDHHmmssZZ');
    orderDetails.stops[1].sched_arrive_late = moment(item.ETA).format('YYYYMMDDHHmmssZZ');

    orderDetails.freightGroup.pro_nbr = item.CONSOL_NBR;
    orderDetails.freightGroup.total_chargeable_weight = item.CHARGEABLE_WEIGHT;
    orderDetails.freightGroup.total_handling_units = item.SHIP_COUNT;
    orderDetails.freightGroup.total_pieces = item.PACKS;
    orderDetails.freightGroup.total_req_spots = item.SHIP_COUNT;
    orderDetails.freightGroup.total_weight = item.CHARGEABLE_WEIGHT;
    orderDetails.freightGroup.weight_uom_type_code = "LBS";

    orderDetails.freightGroup.freightGroupItems = [{
        "__type": "freight_group_item",
        "__name": "freightGroupItems",
        "company_id": "TMS",
        "add_timestamp": moment().format('YYYYMMDDHHmmssZZ'),
        "add_userid": "lmeadm",
        "fgi_sequence_nbr": 1,
        "handling_units": item.SHIP_COUNT,
        "pieces": item.PACKS,
        "req_spots": item.SHIP_COUNT,
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