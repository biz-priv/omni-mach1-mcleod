const AWS = require('aws-sdk');
const request = require('request');
const moment = require('moment-timezone');
const s3 = new AWS.S3({
    region: 'us-east-1'
});
// const csv = require('@fast-csv/parse');
const csv = require('csvtojson');
const { putItem } = require('./shared/dynamodb');

const csv_headers = ["source_system","CONSOL_NBR","ORIGIN_PORT","ORIGIN_CITY","ORIGIN_ST","ORIGIN_LOC_ID",
    "DESTINATION_PORT","DESTINATION_CITY","DESTINATION_ST","DESTINATION_LOC_ID","carrier","CARRIER_BOOKING_RREF",
    "AGENT_REF","BOL","OTHER_INFO","TRUCK_REF","AGENT_TYPE","TRANSPORT_MODE","CONSOL_MODE","ETD","ETA","ATD","ATA",
    "SHIP_COUNT","PACKS","ACTUAL_WEIGHT","CHARGEABLE_WEIGHT","UW"
] 

module.exports.handler = async (event, context) => {
    console.log("EVENT:", event);
    
    let eventBody = JSON.parse(event.Records[0].body);
    let bucketName = eventBody.Records[0].s3.bucket.name;
    let objectName = eventBody.Records[0].s3.object.key;

    const params = {
        Bucket: bucketName,
        Key: objectName,
      };
    const s3Stream = s3.getObject(params).createReadStream();

    let resultArr = await parseCSVData(s3Stream);
    console.log("resultArr:", JSON.stringify(resultArr));

    let promises = resultArr.map( (item) => putItem(process.env.MACH1_MALEOD_TABLE, {...item, processed : false}) );
    await Promise.all(promises);

    promises = resultArr.map( (item) => processRecord(item) );
    await Promise.all(promises);

}


async function parseCSVData(s3Stream) {
    return new Promise( (resolve, reject) => {
        let result = [];
        csv({headers : csv_headers, noheader: true})
            .fromStream(s3Stream)
            .on("data", (data) => {
                const obj = JSON.parse(data.toString('utf8'));
                if( obj.CONSOL_NBR != null ) {
                    result.push(obj);
                }
            })
            .on("end", () => {
                resolve( result )
            });
    });
}

async function processRecord( item ) {
    let getOrderPayload = {
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
    let orderDetails = await getNewOrder(getOrderPayload);

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
    orderDetails.stops[0].sched_arrive_early = item.ETA;
    orderDetails.stops[0].sched_arrive_late = item.ETA;

    orderDetails.stops[1].city = item.DESTINATION_CITY;
    orderDetails.stops[1].state = item.DESTINATION_ST;
    orderDetails.stops[1].location_id = item.DESTINATION_LOC_ID;
    orderDetails.stops[1].order_sequence = 2;
    orderDetails.stops[1].sched_arrive_early = item.ETA;
    orderDetails.stops[1].sched_arrive_late = item.ETA;

    orderDetails.freightGroup.pro_nbr = item.CONSOL_NBR;
    orderDetails.freightGroup.total_chargeable_weight = item.CHARGEABLE_WEIGHT;
    orderDetails.freightGroup.total_handling_units = item.SHIP_COUNT;
    orderDetails.freightGroup.total_pieces = item.PACKS;
    orderDetails.freightGroup.total_req_spots = item.SHIP_COUNT;
    orderDetails.freightGroup.total_weight = item.CHARGEABLE_WEIGHT;
    orderDetails.freightGroup.weight_uom_type_code = "LBS";

    orderDetails.freightGroup.freightGroupItems[0] = {
        "__type": "freight_group_item",
        "__name": "freightGroupItems",
        "company_id": "TMS",
        "add_timestamp": "20230228151300-0600",
        "add_userid": "lmeadm",
        "fgi_sequence_nbr": 1,
        "handling_units": item.SHIP_COUNT,
        "pieces": item.PACKS,
        "req_spots": item.SHIP_COUNT,
        "weight": item.CHARGEABLE_WEIGHT,
        "weight_uom_type_code": "LBS"
    }
}

async function getNewOrder(bodyPayload) {
    let options = {
        uri: process.env.MALEOD_API_ENDPOINT + "new",
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${process.env.MALEOD_API_TOKEN}`
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
                resolve( body )
            }
        });
    });
}

async function postNewOrder(bodyPayload) {
    let options = {
        uri: process.env.MALEOD_API_ENDPOINT + "create",
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${process.env.MALEOD_API_TOKEN}`
        },
        json : bodyPayload
    };
    return new Promise((resolve, reject) => {
        request(options, function (err, data, body) {
            if (err) {
                console.log("Error", err);
                reject(err);
            } else {
                console.log( body );
                resolve( body )
            }
        });
    });
}