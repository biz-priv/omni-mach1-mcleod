const AWS = require("aws-sdk");
var dynamodb = new AWS.DynamoDB.DocumentClient();

async function getTimeZonePort( iataValue ) {
    let params = {
        TableName : process.env.TIMEZONE_TABLE,
        IndexName : "IATA-index",
        KeyConditionExpression: "#iataAttribute = :iataValue",
        ExpressionAttributeNames: {
            "#iataAttribute": "IATA"
        },
        ExpressionAttributeValues: {
            ":iataValue": iataValue
        }
    }
    let result = await dynamodb.query(params).promise();
    return result.Items[0];
}

module.exports = {
    getTimeZonePort
};