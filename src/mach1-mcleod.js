const AWS = require('aws-sdk');
const s3 = new AWS.S3({
    region: 'us-east-1'
});
// const csv = require('@fast-csv/parse');
const csv = require('csvtojson');

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
}


async function parseCSVData(s3Stream) {
    return new Promise( (resolve, reject) => {
        let result = [];
        csv({headers : csv_headers})
            .fromStream(s3Stream)
            .on("data", (data) => {
                if( data.CONSOL_NBR != null ) {
                    result.push(data);
                }
            })
            .on("end", () => {
                resolve( result )
            });
    });
}