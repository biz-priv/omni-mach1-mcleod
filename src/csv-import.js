const AWS = require('aws-sdk');
const request = require('request');
const moment = require('moment-timezone');
const s3 = new AWS.S3({
    region: 'us-east-1'
});
// const csv = require('@fast-csv/parse');
const csv = require('csvtojson');
var dynamodb = new AWS.DynamoDB.DocumentClient();

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

    let promises = resultArr.map( (item) => putItem({...item, processed : 'false', insertedTimeStamp : moment().format()}) );
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
                    result.push(processRecord(obj));
                }
            })
            .on("end", () => {
                resolve( result )
            });
    });
}

function processRecord(item) {
    return { ...item };
}

async function putItem(item) {
    let params = {
        TableName: process.env.MACH1_MALEOD_TABLE,
        Item: item,
        ConditionExpression: 'attribute_not_exists(CONSOL_NBR)'
    };
    return await dynamodb.put(params).promise();
}

