##### S3 bucket and CloudFront deployment for React Dashboard #####

locals {
  common = {
    org         = "br"
    busseg      = "finops"
    sdlcenv     = var.sdlcenv
    product     = "idle-resource-dashboard"
    technology  = "react"
    accountcode = "12345"
    owner       = "vbelide@gmail.com"
    project     = "cloud-optimization"
    chargecode  = "FINOPS-123"
    dept        = "cloud"
    sbu         = "tech"
  }
}

# Assume this WAF applies to your React dashboard as well
data "aws_wafv2_web_acl" "web_acl_cf" {
  name  = "BR_IPs_OWASP_Block"
  scope = "CLOUDFRONT"
}

# The reusable module from your organization
module "cf_webapp" {
  source  = "terraform.prd.bfsaws.net/CSG/cloudfront-w-s3/aws"
  version = "5.1.0"

  function               = "dashboard"
  region                 = var.region
  s3versioning           = "Enabled"
  s3archive              = "Disabled"
  kmskey1                = ""
  targetlogbucket        = "${lookup(local.common, "org")}-${lookup(local.common, "busseg")}${lookup(local.common, "sdlcenv")}-${var.region}-access-log-storage-s3"
  
  enabledforweb          = true
  georestrictiontype     = "none"
  georestrictionlocation = []
  transitiondays         = 0
  purgedays              = 0
  
  common                 = local.common
  
  # TTLs caching strategy: Don't cache index.html, rely on hashing for assets
  minttl                 = 0
  defaultttl             = 0    # Let React handle routing natively instead of stale HTML cache
  maxttl                 = 3600
  
  # Set this to true to deploy the ACM cert
  is_enabled             = 1
  
  # Determine the ACM certificate from an external variable to prevent CF validation race conditions
  acmcertarn             = var.acm_certificate_arn
  urlaliases             = ["idle-dashboard.${var.sdlcenv}.company.com"]
  
  # Important for React: route 403/404 back to index.html for client-side routing
  custom_error_response = [
    {
      error_code            = 403
      response_code         = 200
      response_page_path    = "/index.html"
      error_caching_min_ttl = 10
    },
    {
      error_code            = 404
      response_code         = 200
      response_page_path    = "/index.html"
      error_caching_min_ttl = 10
    }
  ]

  snstopicarn            = var.sns_topic_arn
  web_acl_arn            = data.aws_wafv2_web_acl.web_acl_cf.arn

  providers = {
    aws     = aws
    aws.dns = aws.dns
  }
}
