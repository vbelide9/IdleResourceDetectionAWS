paths:
  /resources:
    get:
      produces:
        - application/json
      responses:
        '200':
          description: 200 response
          schema:
            $ref: '#/definitions/Empty'
          headers:
            Access-Control-Allow-Origin:
              type: string
      x-amazon-apigateway-integration:
        type: aws_proxy
        httpMethod: POST
        uri: >-
          arn:aws:apigateway:${region}:lambda:path/2015-03-31/functions/${ReaderLambda}/invocations
        responses:
          default:
            statusCode: '200'
            responseParameters:
              method.response.header.Access-Control-Allow-Origin: '''*'''
        passthroughBehavior: when_no_match
        contentHandling: CONVERT_TO_TEXT
    options:
      produces:
        - application/json
      responses:
        '200':
          description: 200 response
          schema:
            $ref: '#/definitions/Empty'
          headers:
            Access-Control-Allow-Origin:
              type: string
            Access-Control-Allow-Methods:
              type: string
            Access-Control-Allow-Headers:
              type: string
      x-amazon-apigateway-integration:
        type: mock
        responses:
          default:
            statusCode: '200'
            responseParameters:
              method.response.header.Access-Control-Allow-Methods: '''GET,OPTIONS'''
              method.response.header.Access-Control-Allow-Headers: >-
                'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'
              method.response.header.Access-Control-Allow-Origin: '''*'''
        requestTemplates:
          application/json: '{"statusCode": 200}'
        passthroughBehavior: when_no_match

definitions:
  Empty:
    type: object
    title: Empty Schema
