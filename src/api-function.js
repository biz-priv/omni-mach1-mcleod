const AWS = require('aws-sdk');
const moment = require('moment-timezone');
const { putItem, updateItem } = require('./shared/dynamodb');
const { v4: uuidv4 } = require("uuid");
const { getTimeZonePort } = require('./shared/helper');
const { getNewOrder, getOrderById, postNewOrder, updateOrder } = require('./shared/mcleod-api-helper');
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
        KeyConditionExpression: "record_processed = :processedValue",
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

        //TODO - Check if ShipmentCount = 0 and mcleod id is empty, don't process
        //TODO - Check if ShipmentCount > 0 and mcleod id is empty, call create, and update the process flag
        //TODO - Check if ShipmentCount > 0 and mcleod id is not empty, call update, and update the process flag
        //TODO - ShipmentCount = 0 and mcleod id is not empty, call the void api, and update the process flag

        if ( item.SHIP_COUNT == 0 ) {
            //Case 1 : If SHIP_COUNT = 0 and mcleodId is empty, don't process 
            if( item.mcleodId == null ) {
                console.log( `Item - ${item.CONSOL_NBR} - CASE 1` );
                await markRecordAsProcessed(item.CONSOL_NBR);
            } 
            //Case 2 : If SHIP_COUNT = 0 and mcleodId is not empty, call the void api
            else {
                console.log( `Item - ${item.CONSOL_NBR} - CASE 2` );
                await markRecordAsProcessed(item.CONSOL_NBR);

            }
        } else {
            //Case 3 : If SHIP_COUNT > 0 and mcleodId is empty, call create api
            if( item.mcleodId == null ) {
                console.log( `Item - ${item.CONSOL_NBR} - CASE 3` );

                let getNewOrderPayload = generatePayloadForGetNewOrder(item)
                let getNewOrderResponse = await getNewOrder(getNewOrderPayload);
        
                await addAPILogs( item.CONSOL_NBR, "GET ORDER", getNewOrderPayload, getNewOrderResponse.statusCode, getNewOrderResponse.body );
        
                if ( getNewOrderResponse.statusCode < 200 || getNewOrderResponse.statusCode >= 300 ) {
                    console.log( `Error for ${item.CONSOL_NBR}`, getNewOrderResponse.body );
                    return promiseResponse;   
                }
        
                let createNewOrderPayload = await generatePayloadForCreateOrder( getNewOrderResponse.body, item );
                let createNewOrderResponse = await postNewOrder(createNewOrderPayload);
        
                await addAPILogs( item.CONSOL_NBR, "PUT NEW ORDER", createNewOrderPayload, createNewOrderResponse.statusCode, createNewOrderResponse.body );
        
                if ( createNewOrderResponse.statusCode < 200 || createNewOrderResponse.statusCode >= 300 ) {
                    console.log( `Error for ${item.CONSOL_NBR}`, createNewOrderResponse.body );
                    return promiseResponse;   
                }
            
                await markRecordAsProcessed(item.CONSOL_NBR, createNewOrderResponse.body.id);

            } 
            //Case 4 : If SHIP_COUNT > 0 and mcleodId is not empty, call update api
            else {
                console.log( `Item - ${item.CONSOL_NBR} - CASE 4` );

                let getOrderByIdResponse = await getOrderById(item.mcleodId);

                await addAPILogs( item.CONSOL_NBR, "GET ORDER BY ID", { mcleodId : item.mcleodId }, getOrderByIdResponse.statusCode, getOrderByIdResponse.body );

                if ( getOrderByIdResponse.statusCode < 200 || getOrderByIdResponse.statusCode >= 300 ) {
                    console.log( `Error for ${item.CONSOL_NBR}`, getOrderByIdResponse.body );
                    return promiseResponse;   
                }
                
                let updateOrderPayload = getOrderByIdResponse.body;
                updateOrderPayload.stops = [ updateOrderPayload.stops[0], updateOrderPayload.stops[5] ];
                updateOrderPayload = await generatePayloadForCreateOrder( updateOrderPayload, item );

                let updateOrderResponse = await updateOrder(updateOrderPayload);
        
                await addAPILogs( item.CONSOL_NBR, "PUT UPDATE ORDER", updateOrderPayload, updateOrderResponse.statusCode, updateOrderResponse.body );
        
                if ( updateOrderResponse.statusCode < 200 || updateOrderResponse.statusCode >= 300 ) {
                    console.log( `Error for ${item.CONSOL_NBR}`, createNewOrderResponse.body );
                    return promiseResponse;   
                }
            
                await markRecordAsProcessed(item.CONSOL_NBR);
            }
        }

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
            orderDetails.stops[0].sched_arrive_late = moment.tz(item.ETD, originTimeZone.TzTimeZone).format('YYYYMMDDHHmmssZZ');
            delete orderDetails.stops[0].__statusDescr
            delete orderDetails.stops[0].__typeDescr
            delete orderDetails.stops[0].__loadUnloadDescr
            delete orderDetails.stops[0].__zoneDescr
            delete orderDetails.stops[0].__timezone
            delete orderDetails.stops[0].__groupingKey
            delete orderDetails.stops[0].__operationalStatusDescr
            delete orderDetails.stops[0].id
            delete orderDetails.stops[0].txl_uid
            delete orderDetails.stops[0].zone_id
        }
    }

    if ( item.DESTINATION_PORT ) {
        let destTimeZone = await getTimeZonePort(item.DESTINATION_PORT.substring(2));
        if ( destTimeZone ) {
            orderDetails.stops[1].city = item.DESTINATION_CITY;
            orderDetails.stops[1].state = item.DESTINATION_ST;
            orderDetails.stops[1].location_id = item.DESTINATION_LOC_ID;
            orderDetails.stops[1].order_sequence = 2;
            orderDetails.stops[1].sched_arrive_early = moment.tz(item.ETA, destTimeZone.TzTimeZone).format( 'YYYYMMDDHHmmssZZ');
            orderDetails.stops[1].sched_arrive_late = moment.tz(item.ETA, destTimeZone.TzTimeZone).format('YYYYMMDDHHmmssZZ');
            delete orderDetails.stops[1].__statusDescr
            delete orderDetails.stops[1].__typeDescr
            delete orderDetails.stops[1].__loadUnloadDescr
            delete orderDetails.stops[1].__zoneDescr
            delete orderDetails.stops[1].__timezone
            delete orderDetails.stops[1].__groupingKey
            delete orderDetails.stops[1].__operationalStatusDescr
            delete orderDetails.stops[1].id
            delete orderDetails.stops[1].txl_uid
            delete orderDetails.stops[1].zone_id
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

async function markRecordAsProcessed(CONSOL_NBR, mcleodId = null ) {
    let attributeValues = {
        ":processedValue": "true"
    }
    if ( mcleodId ) {
        attributeValues[":mcleodIdValue"] = mcleodId
    }
    let params = {
        TableName: process.env.MACH1_MALEOD_TABLE,
        Key: {
            CONSOL_NBR: CONSOL_NBR
        },
        UpdateExpression: `set record_processed = :processedValue  ${ mcleodId ? ', mcleodId= :mcleodIdValue' : '' } `,
        ExpressionAttributeValues: attributeValues
    }
    await updateItem(params);
}

async function addAPILogs( CONSOL_NBR, apiName, request, statusCode, response ) {
    let logObj = {
        id: uuidv4(),
        CONSOL_NBR : CONSOL_NBR,
        request_json : request,
        response_json : response,
        api_status_code : statusCode,
        api_endpoint : apiName,
        inserted_time_stamp : moment.tz("America/Chicago").format("YYYY-MM-DD HH:mm:ss").toString()
    }
    await putItem(process.env.MALEOD_API_LOG_TABLE, logObj);
}