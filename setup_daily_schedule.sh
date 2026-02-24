#!/usr/bin/env bash
# =============================================================================
# setup_daily_schedule.sh
# =============================================================================
# Sets up an EventBridge rule that triggers the scanner Lambda every day at
# 02:00 UTC.  Run this script ONCE after deploying your Lambda functions.
#
# Usage:
#   chmod +x setup_daily_schedule.sh
#   SCANNER_LAMBDA_NAME=my-scanner-fn ./setup_daily_schedule.sh
#
# Required env vars (or edit the defaults below):
#   SCANNER_LAMBDA_NAME  - Name of your scanner Lambda function
#   AWS_REGION           - Region where your Lambda is deployed
# =============================================================================
set -euo pipefail

SCANNER_LAMBDA_NAME="${SCANNER_LAMBDA_NAME:-idle-resource-scanner}"
AWS_REGION="${AWS_REGION:-us-east-1}"
RULE_NAME="IdleResourceDailySchedule"

echo "==> Fetching Lambda ARN for: $SCANNER_LAMBDA_NAME (region: $AWS_REGION)"
LAMBDA_ARN=$(aws lambda get-function \
  --function-name "$SCANNER_LAMBDA_NAME" \
  --region "$AWS_REGION" \
  --query 'Configuration.FunctionArn' \
  --output text)
echo "    ARN: $LAMBDA_ARN"

echo "==> Creating EventBridge rule (daily at 02:00 UTC)..."
RULE_ARN=$(aws events put-rule \
  --name "$RULE_NAME" \
  --schedule-expression "cron(0 2 * * ? *)" \
  --state ENABLED \
  --description "Triggers the idle resource scanner Lambda every day at 02:00 UTC" \
  --region "$AWS_REGION" \
  --query 'RuleArn' \
  --output text)
echo "    Rule ARN: $RULE_ARN"

echo "==> Adding Lambda as the rule target..."
aws events put-targets \
  --rule "$RULE_NAME" \
  --region "$AWS_REGION" \
  --targets "Id=ScannerLambdaTarget,Arn=$LAMBDA_ARN"

echo "==> Granting EventBridge permission to invoke the Lambda..."
aws lambda add-permission \
  --function-name "$SCANNER_LAMBDA_NAME" \
  --statement-id "EventBridgeDailySchedule" \
  --action "lambda:InvokeFunction" \
  --principal "events.amazonaws.com" \
  --source-arn "$RULE_ARN" \
  --region "$AWS_REGION" 2>/dev/null || echo "    (Permission already exists — skipping)"

echo ""
echo "✅  Done! The scanner will now run automatically every day at 02:00 UTC."
echo "    To change the schedule, edit the cron expression and re-run this script."
echo "    To delete the rule: aws events delete-rule --name $RULE_NAME --region $AWS_REGION"
