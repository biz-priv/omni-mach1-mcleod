const AWS = require('aws-sdk');
const s3 = new AWS.S3({
    region: 'us-east-1'
});
const csv = require('@fast-csv/parse');

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
        csv
            .parseStream(s3Stream)
            .on("data", (data) => {
                result.push(data);
            })
            .on("end", () => {
                resolve( result )
            });
    });
}