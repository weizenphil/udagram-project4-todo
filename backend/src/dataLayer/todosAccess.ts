import * as AWS  from 'aws-sdk'
import * as AWSXRay from 'aws-xray-sdk'
import { DocumentClient } from 'aws-sdk/clients/dynamodb'
import { TodoItem } from '../models/TodoItem'

const XAWS = AWSXRay.captureAWS(AWS)

export class TodoAccess {

  constructor(
    private readonly docClient: DocumentClient = createDynamoDBClient(),
    private readonly s3 = new XAWS.S3({ signatureVersion: 'v4' }),
    private readonly todoTable = process.env.TODO_TABLE,
    private readonly bucketName = process.env.TODO_S3_BUCKET,
    private readonly urlExpiration = process.env.SIGNED_URL_EXPIRATION,
    private readonly indexName = process.env.TODO_TABLE_INDEX)
    { //
  }

  async getAllTodosByUser(userId: string): Promise<TodoItem[]> {
    console.log('Getting all todos for user')

    const result = await this.docClient.query({
      TableName: this.todoTable,
      IndexName: this.indexName,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId
      },
      ScanIndexForward: false
    }).promise()

    const items = result.Items 
    return items as TodoItem[]
  }
  
  async updateTodo(todo: TodoItem): Promise <TodoItem> {
    
    const updateExpression = 'set #n = :name, dueDate = :dueDate, done = :done'

    await this.docClient.update({
      TableName: this.todoTable,
      Key: {
          userId: todo.userId,
          todoId: todo.todoId
      },
      UpdateExpression: updateExpression,
      ConditionExpression: 'todoId = :todoId',
      ExpressionAttributeValues: {
        ':name': todo.name,
        ':dueDate': todo.dueDate,
        ':done': todo.done,
        ':todoId': todo.todoId
      },
      ExpressionAttributeNames: {
        '#n': 'name'
      },
      ReturnValues: 'UPDATED_NEW'
      }).promise()

    return todo
  }

  async createTodo(todo: TodoItem): Promise<TodoItem> {
    
    const newItem = {
      ...todo
    }
    
    await this.docClient.put({
      TableName: this.todoTable,
      Item: newItem
    }).promise()

    return todo
  }


  async deleteTodo(userId: string, todoId: string): Promise<string> {
    await this.docClient.delete({
      TableName: this.todoTable,
      Key: {
        userId,
        todoId
      },
      ConditionExpression: todoId,
      ExpressionAttributeValues: {
        ':todoId': todoId
      }
    }).promise()
    
    return userId
  }

  async generateUploadUrl(todoId: string): Promise<string> {
     return this.s3.getSignedUrl('putObject', {
      Bucket: this.bucketName,
      Key: todoId,
      Expires: this.urlExpiration
    })
  }
}


function createDynamoDBClient() {
  if (process.env.IS_OFFLINE) {
    console.log('Creating a local DynamoDB instance')
    return new XAWS.DynamoDB.DocumentClient({
      region: 'localhost',
      endpoint: 'http://localhost:8000'
    })
  }

  return new XAWS.DynamoDB.DocumentClient()
}
  