##### API Gateway Deployment for Idle Resource Reader Lambda #####

# Load the external Swagger template and inject variables
data "template_file" "es_swaggerfile" {
  template = file("API-Gateway/es-swagger-idle.yml.tpl")
  vars = {
    env          = lookup(local.common, "sdlcenv")
    account      = data.aws_caller_identity.current.account_id
    region       = var.region
    ReaderLambda = aws_lambda_function.reader.arn 
  }
}

# Regional API Gateway connected to the Reader Lambda
module "idle_resources_api_gw" {
  source                      = "terraform.prd.bfsaws.net/CSG/apigw/aws"
  version                     = "4.3.9"
  
  common                      = local.common
  region                      = var.region
  is_enabled                  = 1 
  function                    = "idle-resources-api"
  stage_name                  = var.api_stage_name 
  mediatype                   = []
  invocation_map_cnt          = 0
  
  api_body                    = data.template_file.es_swaggerfile.rendered
  api_description             = "API Gateway for Idle Resource Detection Dashboard connected to Reader Lambda"
  xray_tracing_enabled        = "true"
  
  vpc_id                      = data.aws_vpc.currentvpc.id
  subnetids                   = data.aws_subnet.web_a.id 
  securitygroupids            = var.use_new_sgs ? "" : data.aws_security_group.BR-AWS-Outbound.id
  endpoint_configuration_type = ["REGIONAL"]
  
  alarm_actions               = [var.sns_topic_arn]
  web_acl_arn                 = data.aws_wafv2_web_acl.web_acl_cf.arn 
  format                      = var.apigw_accesslog_format
  
  # Uncomment these if you plan to attach a custom domain name from Route53/ACM to this API Gateway
  # apigw_cert_arn              = data.aws_acm_certificate.apigw_fe_cert.arn
  # apigw_domain_name           = "$${var.api_gateway_fe_function}.$${var.env_alias}.$${var.region}.$${data.aws_ssm_parameter.r53pubzone.value}"
}

# IMPORTANT: You must grant the API Gateway permission to execute your Reader Lambda
resource "aws_lambda_permission" "apigw_lambda" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.reader.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "arn:aws:execute-api:$${var.region}:$${data.aws_caller_identity.current.account_id}:$${module.idle_resources_api_gw.rest_api_id}/*/*"
}
