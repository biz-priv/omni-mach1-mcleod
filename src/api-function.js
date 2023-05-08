const AWS = require('aws-sdk');
const moment = require('moment-timezone');
const { putItem, updateItem } = require('./shared/dynamodb');
const { v4: uuidv4 } = require("uuid");
const { getTimeZonePort } = require('./shared/helper');
const { getNewOrder, getOrderById, postNewOrder, updateOrder } = require('./shared/mcleod-api-helper');
var dynamodb = new AWS.DynamoDB.DocumentClient();

const orderTypeIdMapping = {
    "prod" : "STN",
    "uat" : "STN",
    "dev" : "STD"
}

module.exports.handler = async (event, context) => {
    let unprocessedRecords = await queryUnprocessedRecords();
    console.log( unprocessedRecords );

    await sendMessageToSNS("Test");

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
        if ( item.SHIP_COUNT == 0 ) {
            //Case 1 : EMPTY ORDER : If SHIP_COUNT = 0 and mcleodId is empty, don't process 
            if( item.mcleodId == null ) {
                console.log( `Item - ${item.CONSOL_NBR} - CASE 1` );
                await markRecordAsProcessed(item.CONSOL_NBR);
            } 
            //Case 2 : VOID ORDER : If SHIP_COUNT = 0 and mcleodId is not empty, call the void api
            else {
                console.log( `Item - ${item.CONSOL_NBR} - CASE 2 : VOID ORDER` );
                await markRecordAsProcessed(item.CONSOL_NBR);
                let getOrderByIdResponse = await getOrderById(item.mcleodId);

                await addAPILogs( item.CONSOL_NBR, "GET ORDER BY ID", { mcleodId : item.mcleodId }, getOrderByIdResponse.statusCode, getOrderByIdResponse.body );

                if ( getOrderByIdResponse.statusCode < 200 || getOrderByIdResponse.statusCode >= 300 ) {
                    console.log( `Error for ${item.CONSOL_NBR}`, getOrderByIdResponse.body );
                    return promiseResponse;   
                }
                
                let voidOrderPayload = JSON.parse(getOrderByIdResponse.body);
                voidOrderPayload.status = "V";
                voidOrderPayload.order_type_id = orderTypeIdMapping[process.env.API_ENVIRONMENT]

                let updateOrderResponse = await updateOrder(voidOrderPayload);
        
                await addAPILogs( item.CONSOL_NBR, "PUT UPDATE ORDER", voidOrderPayload, updateOrderResponse.statusCode, updateOrderResponse.body );
        
                if ( updateOrderResponse.statusCode < 200 || updateOrderResponse.statusCode >= 300 ) {
                    console.log( `Error for ${item.CONSOL_NBR}`, updateOrderResponse.body );
                    return promiseResponse;   
                }
            
                await markRecordAsProcessed(item.CONSOL_NBR);
            }
        } else {
            //Case 3 : NEW ORDER : If SHIP_COUNT > 0 and mcleodId is empty, call create api
            if( item.mcleodId == null ) {
                console.log( `Item - ${item.CONSOL_NBR} - CASE 3 : NEW ORDER` );

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
            //Case 4 : UPDATE ORDER : If SHIP_COUNT > 0 and mcleodId is not empty, call update api
            else {
                console.log( `Item - ${item.CONSOL_NBR} - CASE 4 : UPDATE ORDER` );

                let getOrderByIdResponse = await getOrderById(item.mcleodId);

                await addAPILogs( item.CONSOL_NBR, "GET ORDER BY ID", { mcleodId : item.mcleodId }, getOrderByIdResponse.statusCode, getOrderByIdResponse.body );

                if ( getOrderByIdResponse.statusCode < 200 || getOrderByIdResponse.statusCode >= 300 ) {
                    console.log( `Error for ${item.CONSOL_NBR}`, getOrderByIdResponse.body );
                    return promiseResponse;   
                }

                console.log("Get Orders response : ", getOrderByIdResponse.body );
                
                let updateOrderPayload = await generatePayloadForUpdateOrder(getOrderByIdResponse.body, item);
                console.log("Update Payload", JSON.stringify(updateOrderPayload))

                let updateOrderResponse = await updateOrder(updateOrderPayload);
        
                await addAPILogs( item.CONSOL_NBR, "PUT UPDATE ORDER", updateOrderPayload, updateOrderResponse.statusCode, updateOrderResponse.body );
        
                if ( updateOrderResponse.statusCode < 200 || updateOrderResponse.statusCode >= 300 ) {
                    console.log( `Error for ${item.CONSOL_NBR}`, updateOrderResponse.body );
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

    orderDetails.order_type_id = orderTypeIdMapping[process.env.API_ENVIRONMENT];
    orderDetails.blnum = item.CONSOL_NBR;
    orderDetails.collection_method = "P";
    orderDetails.customer_id = "MACH1LIN";
    orderDetails.pallets_how_many = item.PACKS;
    orderDetails.pieces = item.PACKS;
    orderDetails.weight = item.CHARGEABLE_WEIGHT;
    orderDetails.rate_type = "C";
    orderDetails.rate_unit_desc = "CWT";

    if ( item.ORIGIN_PORT ) {
        let originTimeZone = await getTimeZonePort(item.ORIGIN_PORT.substring(2));
        if ( originTimeZone ) {
            orderDetails.stops[0].city = item.ORIGIN_CITY;
            orderDetails.stops[0].state = item.ORIGIN_ST;
            orderDetails.stops[0].location_id = item.ORIGIN_LOC_ID;
            orderDetails.stops[0].order_sequence = 1;
            orderDetails.stops[0].sched_arrive_early = moment.tz(item.ETD, originTimeZone.TzTimeZone).format( 'YYYYMMDDHHmmssZZ');
            orderDetails.stops[0].sched_arrive_late = moment.tz(item.ETD, originTimeZone.TzTimeZone).format('YYYYMMDDHHmmssZZ');
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
        "weight_uom_type_code": "LBS",
        "nmfc_class_code": "00"
    }];
    
    return orderDetails;
}

async function generatePayloadForUpdateOrder(getOrderResponse, item) {
    //Add orderId if not there "id"
    
    let payload = { ...JSON.parse(getOrderResponse) };

    let {
        enteredUser, freight_charge, freight_charge_c, freight_charge_d, freight_charge_n, freight_charge_r, movements,
        otherCharges, otherchargetotal_c, otherchargetotal_d, otherchargetotal_n, otherchargetotal_r, rate, rate_units,
        totalcharge_and_excisetax, totalcharge_and_excisetax_c, totalcharge_and_excisetax_d, totalcharge_and_excisetax_n,
        totalcharge_and_excisetax_r, total_charge, total_charge_c, total_charge_d, total_charge_n, total_charge_r,
        ...orderDetails
    } = payload;

    orderDetails.order_type_id = orderTypeIdMapping[process.env.API_ENVIRONMENT];
    orderDetails.pallets_how_many = item.PACKS;
    orderDetails.pieces = item.PACKS;
    orderDetails.weight = item.CHARGEABLE_WEIGHT;
    orderDetails.rate_type = "C";
    orderDetails.rate_unit_desc = "CWT";
    orderDetails.__rateTypeDescr = "CWT";

    if ( item.ORIGIN_PORT ) {
        let originTimeZone = await getTimeZonePort(item.ORIGIN_PORT.substring(2));
        if ( originTimeZone ) {
            orderDetails.stops[0].city = item.ORIGIN_CITY;
            orderDetails.stops[0].state = item.ORIGIN_ST;
            orderDetails.stops[0].location_id = item.ORIGIN_LOC_ID;
            orderDetails.stops[0].order_sequence = 1;
            orderDetails.stops[0].sched_arrive_early = moment.tz(item.ETD, originTimeZone.TzTimeZone).format( 'YYYYMMDDHHmmssZZ');
            orderDetails.stops[0].sched_arrive_late = moment.tz(item.ETD, originTimeZone.TzTimeZone).format('YYYYMMDDHHmmssZZ');
        }
    }

    if ( item.DESTINATION_PORT ) {
        let destTimeZone = await getTimeZonePort(item.DESTINATION_PORT.substring(2));
        if ( destTimeZone ) {
            let lastIndex = orderDetails.stops.length - 1;
            orderDetails.stops[lastIndex].city = item.DESTINATION_CITY;
            orderDetails.stops[lastIndex].state = item.DESTINATION_ST;
            orderDetails.stops[lastIndex].location_id = item.DESTINATION_LOC_ID;
            orderDetails.stops[lastIndex].order_sequence = 2;
            orderDetails.stops[lastIndex].sched_arrive_early = moment.tz(item.ETA, destTimeZone.TzTimeZone).format( 'YYYYMMDDHHmmssZZ');
            orderDetails.stops[lastIndex].sched_arrive_late = moment.tz(item.ETA, destTimeZone.TzTimeZone).format('YYYYMMDDHHmmssZZ');
        }
    }

    if ( orderDetails.id == null ) {
        orderDetails.id = item.mcleodId;
    }

    delete orderDetails.freightGroup.fgpXBfgs[0].revenueDetails;
    orderDetails.freightGroup.total_chargeable_weight = item.CHARGEABLE_WEIGHT;
    orderDetails.freightGroup.total_handling_units = item.PACKS;
    orderDetails.freightGroup.total_pieces = item.PACKS;
    orderDetails.freightGroup.total_req_spots = item.PACKS;
    orderDetails.freightGroup.total_weight = item.CHARGEABLE_WEIGHT;

    delete orderDetails.freightGroup.freightGroupItems[0].revenueDetails;
    orderDetails.freightGroup.freightGroupItems[0].handling_units = item.PACKS;
    orderDetails.freightGroup.freightGroupItems[0].pieces = item.PACKS;
    orderDetails.freightGroup.freightGroupItems[0].req_spots = item.PACKS;
    orderDetails.freightGroup.freightGroupItems[0].weight = item.CHARGEABLE_WEIGHT;
    orderDetails.freightGroup.freightGroupItems[0].nmfc_class_code = "00";

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

async function sendMessageToSNS( message ) {
    var params = {
        Message: message,
        TopicArn: process.env.MALEOD_API_TOPIC_ARN
    };
    var publishTextPromise = new AWS.SNS({apiVersion: '2010-03-31'}).publish(params).promise();
    await publishTextPromise();
}