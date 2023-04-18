const AWS = require("aws-sdk");
var dynamodb = new AWS.DynamoDB.DocumentClient();

async function putItem(tableName, item) {
    let params;
    try {
      params = {
        TableName: tableName,
        Item: item,
      };
      return await dynamodb.put(params).promise();
    } catch (e) {
      console.error("Put Item Error: ", e, "\nPut params: ", params);
      throw "PutItemError";
    }
}

async function getItem(params){
    try {
        var getItem = await dynamodb.get(params).promise();
        return (getItem);
    } catch (error) {
        console.log("Error in getting item:", error);
        return null;
    }
}

async function updateItem(params){
  try {
    var updateItem = await dynamodb.update(params).promise();
    return (updateItem);
  } catch (error) {
    console.log("Error in getting item:", error);
    return null;
  }
}

module.exports = {
    getItem,
    putItem,
    updateItem
};