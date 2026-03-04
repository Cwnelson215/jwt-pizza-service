#!/bin/bash
aws ecs create-service \
  --cluster portfolio-dev-cluster \
  --service-name jwt-pizza-service \
  --task-definition jwt-pizza-services:1 \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-0cd1ece8d99b2ac5b,subnet-03c79e93738b83c23],securityGroups=[sg-0f0a0bb94830df917],assignPublicIp=ENABLED}" \
  --load-balancers "targetGroupArn=arn:aws:elasticloadbalancing:us-east-1:861276096574:targetgroup/jwt-pizza-service-tg/733b2d713d8713a4,containerName=jwt-pizza,containerPort=80"
