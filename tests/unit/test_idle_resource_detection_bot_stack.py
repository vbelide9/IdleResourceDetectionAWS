import aws_cdk as core
import aws_cdk.assertions as assertions

from idle_resource_detection_bot.idle_resource_detection_bot_stack import IdleResourceDetectionBotStack

# example tests. To run these tests, uncomment this file along with the example
# resource in idle_resource_detection_bot/idle_resource_detection_bot_stack.py
def test_sqs_queue_created():
    app = core.App()
    stack = IdleResourceDetectionBotStack(app, "idle-resource-detection-bot")
    template = assertions.Template.from_stack(stack)

#     template.has_resource_properties("AWS::SQS::Queue", {
#         "VisibilityTimeout": 300
#     })
