const AWS = require('aws-sdk');
const csv = require('csvtojson');
const s3 = new AWS.S3({
    region: 'us-east-1'
});
var dynamodb = new AWS.DynamoDB.DocumentClient();
const { putItem } = require('./shared/dynamodb');

module.exports.handler = async (event, context) => {

    const params = {
        Bucket: "omni-airport-timezone",
        Key: "TimeZone.csv",
    };
    const s3Stream = s3.getObject(params).createReadStream();

    let resultArr = await parseCSVData(s3Stream);
    console.log("resultArr length:", resultArr.length);
    console.log("resultArr[0]:", JSON.stringify(resultArr[0]));


    // let promises = resultArr.map( item => putItem("omni-wt-rt-airport-timezone", item) );
    // await Promise.all(promises);

}

async function parseCSVData(s3Stream) {
    return new Promise( (resolve, reject) => {
        let result = [];
        csv()
            .fromStream(s3Stream)
            .on("data", (data) => {
                result.push(obj);
            })
            .on("end", () => {
                resolve( result )
            });
    });
}