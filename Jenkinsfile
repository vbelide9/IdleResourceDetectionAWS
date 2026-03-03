pipeline {
    agent any

    environment {
        // --- Configuration ---
        APP_NAME     = 'idle-resource-dashboard'
        VERSION      = "1.0.${BUILD_NUMBER}"
        ARTIFACT_PKG = "${APP_NAME}-${VERSION}.tar.gz"
        
        // AWS Config
        AWS_REGION         = 'us-east-1'
        S3_BUCKET          = 'br-finopsdev-idle-resource-dashboard-react-us-east-1-s3'
        CLOUDFRONT_DIST_ID = 'EXXXXXXXXXXXXX'  // Set this to your CF ID from Terraform
        
        // JFrog Config
        RT_SERVER_ID = 'My-Artifactory' // The ID of the generic Artifactory server in Jenkins Config
        RT_REPO      = 'finops-generic-local' // The JFrog repository to store the artifacts
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Build Angular App') {
            steps {
                dir('dashboard') {
                    // Install dependencies cleanly
                    sh 'npm ci'

                    // We must inject DASHBOARD_ACCOUNTS as a real environment variable into the build
                    // This injects the credentials string into the environment.ts file that Angular reads on build.
                    sh """
                    cat > src/environments/environment.ts <<EOF
export const environment = {
  production: true,
  accounts: \${DASHBOARD_ACCOUNTS}
};
EOF
                    """

                    // Build the production-ready static files into the /dist/dashboard/browser folder
                    sh 'npm run build'
                }
            }
        }

        stage('Archive & Publish to JFrog') {
            steps {
                dir('dashboard') {
                    // Compress the built files into a tarball
                    sh "tar -czvf ${ARTIFACT_PKG} -C dist/dashboard ."
                    
                    // Upload to JFrog Artifactory using the Jenkins Artifactory Integration
                    rtUpload(
                        serverId: "${RT_SERVER_ID}",
                        spec: """{
                          "files": [
                            {
                              "pattern": "${ARTIFACT_PKG}",
                              "target": "${RT_REPO}/${APP_NAME}/${VERSION}/"
                            }
                          ]
                        }"""
                    )
                }
            }
        }

        stage('Deploy to S3 via JFrog Pull') {
            steps {
                // In an enterprise, this stage might run on a different deployment node
                // But for now, we'll download the exact artifact we just pushed to verify the pipeline
                
                // 1. Create a clean deployment directory
                sh 'rm -rf deploy_workspace && mkdir deploy_workspace'
                
                dir('deploy_workspace') {
                    // 2. Download the artifact from Artifactory
                    rtDownload(
                        serverId: "${RT_SERVER_ID}",
                        spec: """{
                          "files": [
                            {
                              "pattern": "${RT_REPO}/${APP_NAME}/${VERSION}/${ARTIFACT_PKG}",
                              "target": "./"
                            }
                          ]
                        }"""
                    )
                    
                    // 3. Extract it
                    sh "tar -xzvf ${RT_REPO}/${APP_NAME}/${VERSION}/${ARTIFACT_PKG}"
                    
                    // 4. Sync the extracted HTML/JS/CSS to the S3 bucket managed by Terraform
                    // --delete ensures old React hashes are removed to save space
                    sh "aws s3 sync . s3://${S3_BUCKET} --region ${AWS_REGION} --delete"
                }
            }
        }

        stage('Invalidate CloudFront Cache') {
            steps {
                // Ensure users get the fresh React app immediately
                sh """
                aws cloudfront create-invalidation \
                    --distribution-id ${CLOUDFRONT_DIST_ID} \
                    --paths "/*" \
                    --region ${AWS_REGION}
                """
            }
        }
    }

    post {
        always {
            // Clean up the node agents to save disk space
            sh 'rm -rf dashboard/node_modules dashboard/dist dashboard/*.tar.gz deploy_workspace'
            echo "Pipeline complete."
        }
    }
}
