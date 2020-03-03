#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import {SecretValue, Stack} from '@aws-cdk/core';
import {CicdSpaWebsite} from '../lib/cicd_spa_website';

const app = new cdk.App();
const stack = new Stack(app, 'fld-public-site-cicd', {
    env: {account: 'asdf', region: 'us-east-1'},
});

new CicdSpaWebsite(stack, 'fld-public-site', {
    url: 'www.matthewbonig.com',
    githubSource: {
        owner: 'mbonig',
        repo: 'public_site',
        oauthToken: SecretValue.secretsManager('github-oauth-token')
    },
    hostedZone: {
        hostedZoneId: 'asdf',
        zoneName: 'matthewbonig.com'
    },
    certificate: true
});
