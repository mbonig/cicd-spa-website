# SPA + CICD Website Construct

This CDK construct is used to create a static website with a CodePipeline to deploy 
from source code on pushes to `master`. The goal of this construct is to be able to
point it at a git repository, give it a url, 
and you've got a continuously deployed static website.

# This is a pre-release!

This is a quick first-draft. All the options that will likely need to be added to accomodate a large
number of use-cases are still needed. If you'd like to make requests or help update this construct, please
open an [Issue](https://github.com/mbonig/cicd-spa-website/issues) or a [PR](https://github.com/mbonig/cicd-spa-website/pulls).

## What Gets Created

At the base level, the following will be built:

* An S3 bucket for build artifacts
* An S3 bucket for the website content
* CICD Pipeline - CodePipeline sourced from Github, built using CodeBuild and deployed to an S3 bucket.

If a certificate is supplied or requested: 

* An ACM certificate will be provisioned via DNS if requested
* A CloudFront Distribution pointing to the S3 bucket.

## Example

This will create the website, the deployment pipeline, and add a generated certificate (and CloudFront) for HTTPS support.

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

|property|description|example
|---|---|---
|url|The url you'd like your website to be available at. Must be full url and must be controlled by the given HostedZone| www.matthewbonig.com
|githubSource.owner|The Github repository's owner | mbonig
|githubSource.repo|The GH repo name | public_site
|githubSource.branch|An optional branch name. Defaults to 'master'| qa
|githubSource.oauthToken|An ISecret pointing to an oauthToken. | SecretValue.secretsManager('github-oauth-token') 
|hostedZone|(Optional) - If provided, used to create DNS Records.
|hostedZone.hostedZoneId|The hostedZone ID for the 'url's domain | ABCDEFGHI
|hostedZone.zoneName|The hostedZone's name | matthewbonig.com
|certificate|(Optional) - If provided, creates a CloudFront Distribution with the given certificate. If 'true' is provided, then a certificate will be generated.| true
|buildSpec|(Optional) - If provided, will override the default BuildSpec in the CodeBuild project. Accepts either a string value (the filename in the source code) or an object. The object is passed to the [BuildSpec.fromObject()](https://docs.aws.amazon.com/cdk/api/latest/docs/@aws-cdk_aws-codebuild.BuildSpec.html#static-from-wbr-objectvalue). If not provided, see [BuildSpec](#buildspec).|build-prod.yaml

## Design Notes

### Certificates

If a certificate is required to provide HTTPS support then a simple S3 Bucket with website hosting will not work. This construct chooses to put a CloudFront Distribution in front of it when a certificate is required. 

If that certificate already exists, it can be supplied as an ICertificate. If not, then it will be created using a [DNSValidatedCertificate](https://docs.aws.amazon.com/cdk/api/latest/docs/@aws-cdk_aws-certificatemanager.DnsValidatedCertificate.html). 

If no certificate is supplied or requested, then the site will be hosted using a public S3 Bucket with Website Hosting enabled. No CloudFront Distribution will be created in that case.

### Github Sources

Github source information is provided through props for the construct. 

If you'd like to see support for another type of Source action, please open an [Issue](https://github.com/mbonig/cicd-spa-website/issues) or a [PR](https://github.com/mbonig/cicd-spa-website/pulls).

### BuildSpec

The default buildspec is defined at [DEFAULT_BUILD_SPEC](./lib/cicd_spa_website.ts). It uses a Node v12 runtime, runs an `npm install` and then an `npm run build` and assumes the static deliverables are in the `dist` directory. 

You may override the BuildSpec with either your own object or by passing a string which will be interpreted as a filename within the source to use.

## Contributing

Please open Pull Requests and Issues on the [Github Repo](https://github.com/mbonig/cicd-spa-website).

## License

MIT
