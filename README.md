# SPA + CICD Website Construct

This CDK construct is used to create a static website with a CICD pipeline from source code.

## What gets created

At the base level, the following will be built:

* An S3 bucket for build artifacts
* An S3 bucket for the website content
* CICD Pipeline - CodePipeline sourced from Github, built using CodeBuild and deployed to an S3 bucket.

If a certificate is supplied or requested: 

* An ACM certificate will be provisioned via DNS if requested
* A CloudFront Distribution pointing to the S3 bucket.

## Example

```typescript
new CicdSpaWebsite(stack, 'public-site', {
    url: 'www.matthewbonig.com',
    githubSource: {
        owner: 'mbonig',
        repo: 'public_site',
        oauthToken: SecretValue.secretsManager('github-oauth-token')
    },
    hostedZone: {
        hostedZoneId: 'ABCDEFGHIJKLM',
        zoneName: 'matthewbonig.com'
    },
    certificate: true
});
```

## Input Properties

|property|description|
|---|---|
|url|The url you'd like your website to be available at. Must be full url and must be controlled by the given HostedZone
|githubSource.owner|The Github repository's owner
|githubSource.repo|The GH repo name
|githubSource.branch|An optional branch name. Defaults to 'master'
|githubSource.oauthToken|An ISecret pointing to an oauthToken.
|hostedZone|(Optional) - If provided, used to create DNS Records.
|hostedZone.hostedZoneId|The hostedZone ID for the 'url's domain
|hostedZone.zoneName|The hostedZone's name
|certificate|(Optional) - If provided, creates a CloudFront Distribution with the given certificate. If 'true' is provided, then a certificate will be generated.
|buildSpec|(Optional) - If provided, will override the default BuildSpec in the CodeBuild project. Accepts either a string value (the filename in the source code) or an object. The object is passed to the [BuildSpec.fromObject()](https://docs.aws.amazon.com/cdk/api/latest/docs/@aws-cdk_aws-codebuild.BuildSpec.html#static-from-wbr-objectvalue)

## Design Notes

### Certificates

If a certificate is required to provide HTTPS support then a simple S3 Bucket with website hosting will not work. This construct chooses to put a CloudFront Distribution in front of it when a certificate is required. 

If that certificate already exists, it can be supplied as an ICertificate. If not, then it will be created using a [DNSValidatedCertificate](https://docs.aws.amazon.com/cdk/api/latest/docs/@aws-cdk_aws-certificatemanager.DnsValidatedCertificate.html). 

If no certificate is supplied or requested, then the site will be hosted using a public S3 Bucket with Website Hosting enabled. No CloudFront Distribution will be created in that case.

### Github Sources

Github source information is provided through props for the construct. 

However, if you want to provide your own source action, provide it on the optional `sourceAction` prop.


## Contributing

Please open Pull Requests and Issues on the [Github Repo](https://github.com/mbonig/cicd-spa-website).

## License

MIT
