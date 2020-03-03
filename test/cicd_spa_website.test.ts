import '@aws-cdk/assert/jest';
import * as cdk from '@aws-cdk/core';
import {SecretValue, Stack} from '@aws-cdk/core';
import {Pipeline} from "@aws-cdk/aws-codepipeline";
import {GitHubSourceAction, S3DeployAction} from "@aws-cdk/aws-codepipeline-actions";
import {CicdSpaWebsite, CicdSpaWebsiteProps, DEFAULT_BUILD_SPEC} from "../lib/cicd_spa_website";
import {Certificate} from "@aws-cdk/aws-certificatemanager";


const CONSTRUCT_ID = 'my-test-construct';


let minimumProps = {
    url: 'demo.matthewbonig.com',
    githubSource: {
        owner: 'mbonig',
        repo: 'fld_public_site',
        oauthToken: SecretValue.secretsManager('github-oauth-token')
    }
};

let withUrlProps = {
    url: 'demo.matthewbonig.com',
    hostedZone: {
        hostedZoneId: 'ABCDEFGHIJKLMN',
        zoneName: 'matthewbonig.com'
    },
    githubSource: {
        owner: 'mbonig',
        repo: 'fld_public_site',
        oauthToken: SecretValue.secretsManager('github-oauth-token')
    }
};

let withUrlAndCertProps = {
    url: 'demo.matthewbonig.com',
    hostedZone: {
        hostedZoneId: 'ABCDEFGHIJKLMN',
        zoneName: 'matthewbonig.com'
    },
    certificate: true,
    githubSource: {
        owner: 'mbonig',
        repo: 'fld_public_site',
        oauthToken: SecretValue.secretsManager('github-oauth-token')
    }
};


function createStack(props: CicdSpaWebsiteProps | Function) {
    const app = new cdk.App();
    const stack = new Stack(app, 'testing-stack', {env: {account: '1234567', region: 'us-east-1'}});
    let propsToUse: CicdSpaWebsiteProps = props as CicdSpaWebsiteProps;
    if (props instanceof Function) {
        propsToUse = props(stack);
    }
    new CicdSpaWebsite(stack, CONSTRUCT_ID, propsToUse);
    return stack;
}


describe('s3 bucket website bucket', () => {
    test('has url as bucket name', () => {
        const stack = createStack(minimumProps);
        expect(stack).toHaveResource('AWS::S3::Bucket', {
            BucketName: minimumProps.url
        });
    });
    test('website configuration is set if certificate is not provided', () => {
        const stack = createStack(minimumProps);
        expect(stack).toHaveResource('AWS::S3::Bucket', {
            WebsiteConfiguration: {
                ErrorDocument: 'index.html',
                IndexDocument: 'index.html'
            }
        });
    });
    test('Does not make bucket public if cloudfront is used with certificate', () => {
        const stack = createStack(withUrlAndCertProps);
        expect(stack).not.toHaveResource('AWS::S3::Bucket', {
            WebsiteConfiguration: {
                ErrorDocument: 'index.html',
                IndexDocument: 'index.html'
            }
        });

        expect(stack).toHaveResourceLike("AWS::S3::BucketPolicy", {
            "PolicyDocument": {
                "Statement": [
                    {
                        "Action": "s3:GetObject",
                        "Effect": "Allow",
                        "Principal": {
                            "CanonicalUser": {
                                "Fn::GetAtt": [
                                    "mytestconstructoai955F29D5",
                                    "S3CanonicalUserId"
                                ]
                            }
                        }
                    }, {}
                ]
            }
        });
    });
});

describe('CloudFront distribution', () => {
    test('Creates if certificate is provided', () => {
        const stack = createStack((stack: Stack) => ({
            ...withUrlAndCertProps,
            certificate: Certificate.fromCertificateArn(stack, 'cert', 'somelongarn')
        }));
        expect(stack).toHaveResourceLike("AWS::CloudFront::Distribution", {
            "DistributionConfig": {
                "ViewerCertificate": {
                    "AcmCertificateArn": "somelongarn",
                    "SslSupportMethod": "sni-only"
                }
            }
        });
    });

    test('Creates if certificate is true', () => {
        const stack = createStack(withUrlAndCertProps);
        expect(stack).toHaveResource("AWS::CloudFront::Distribution");

        const construct = stack.node.findChild(CONSTRUCT_ID);
        const certificate = construct.node.tryFindChild('certificate');

        expect(certificate).toBeTruthy();
    });

    test('does not create if certificate is false or not provided', () => {
        const stack = createStack(minimumProps);
        const construct = stack.node.findChild(CONSTRUCT_ID);
        const certificate = construct.node.tryFindChild('certificate');

        expect(certificate).toBeUndefined();
    });

    test('throws error if certificate requested but no hostedZone', () => {
        expect(() => {
            createStack({
                ...minimumProps,
                certificate: true
            });

        }).toThrow(/If you'd like a certificate then you must provide a `hostedZone`./);

    });

    test('uses OAI', () => {
        const stack = createStack(withUrlAndCertProps);

        expect(stack).toHaveResourceLike('AWS::CloudFront::CloudFrontOriginAccessIdentity');
    });
});

describe('artifacts buckets', () => {

    test('is not public', () => {
        const stack = createStack(minimumProps);
        expect(stack).toHaveResource('AWS::S3::Bucket', {
            "BucketEncryption": {
                "ServerSideEncryptionConfiguration": [
                    {
                        "ServerSideEncryptionByDefault": {
                            "SSEAlgorithm": "aws:kms"
                        }
                    }
                ]
            },
            "BucketName": `${minimumProps.url.replace(/\./gi, '-')}-artifacts`,
            "PublicAccessBlockConfiguration": {
                "BlockPublicAcls": true,
                "BlockPublicPolicy": true,
                "IgnorePublicAcls": true,
                "RestrictPublicBuckets": true
            }
        });
    });
});

describe('github source', () => {
    test('uses passed values', () => {

        const stack = createStack(minimumProps);

        // we gotta go deep
        let iConstruct = stack.node.findChild(CONSTRUCT_ID);
        // inception style
        const codePipeline: Pipeline = iConstruct.node.findChild(`build-pipeline`) as Pipeline;

        // there's the good stuff.
        const action: GitHubSourceAction = codePipeline.stages[0].actions[0] as any;

        // @ts-ignore
        expect(action.props.oauthToken).toBe(minimumProps.githubSource.oauthToken);
        // @ts-ignore
        expect(action.props.repo).toBe(minimumProps.githubSource.repo);
        // @ts-ignore
        expect(action.props.owner).toBe(minimumProps.githubSource.owner);
    });
});

describe('codebuild', () => {
    test('uses default buildspec', () => {
        const stack = createStack(minimumProps);

        expect(stack).toHaveResourceLike("AWS::CodeBuild::Project", {
            "Source": {
                "BuildSpec": JSON.stringify(DEFAULT_BUILD_SPEC, null, 2)
            }
        });
    });
    test('uses passed string for buildspec', () => {
        const stack = createStack({...minimumProps, buildSpec: 'buildspec.yaml'});

        expect(stack).toHaveResourceLike("AWS::CodeBuild::Project", {
            "Source": {
                "BuildSpec": 'buildspec.yaml'
            }
        });
    });
    test('uses passed object for buildspec', () => {
        let buildSpec = {one: 'two', three: 'four'};

        const stack = createStack({...minimumProps, buildSpec});
        expect(stack).toHaveResourceLike("AWS::CodeBuild::Project", {
            "Source": {
                "BuildSpec": JSON.stringify(buildSpec, null, 2)
            }
        });

    });
});

describe('codepipeline', () => {
    test(`doesn't includes invalidate when certificate is not supplied`, () => {
        const stack = createStack(minimumProps);

        const construct = stack.node.findChild(CONSTRUCT_ID);
        const pipeline = construct.node.findChild('build-pipeline') as Pipeline;
        const deployActions = pipeline.stages[2].actions;
        expect(deployActions).toHaveLength(1);
    });

    test('includes invalidate when cloudfront is used', () => {
        const stack = createStack(withUrlAndCertProps);
        const construct = stack.node.findChild(CONSTRUCT_ID);
        const pipeline = construct.node.findChild('build-pipeline') as Pipeline;
        const deployActions = pipeline.stages[2].actions;
        expect(deployActions).toHaveLength(2);
    });

    test('deploys to s3 bucket with public when no cert set', () => {
        const stack = createStack(minimumProps);
        const construct = stack.node.findChild(CONSTRUCT_ID);
        const pipeline = construct.node.findChild('build-pipeline') as Pipeline;
        const deployActions = pipeline.stages[2].actions;
        const deployAction = deployActions[0] as S3DeployAction;

        // @ts-ignore
        expect(deployAction.props.accessControl).toBe("public-read");
    });

    test('deploys to s3 bucket with private when cert set', () => {
        const stack = createStack(withUrlAndCertProps);
        const construct = stack.node.findChild(CONSTRUCT_ID);
        const pipeline = construct.node.findChild('build-pipeline') as Pipeline;
        const deployActions = pipeline.stages[2].actions;
        const deployAction = deployActions[0] as S3DeployAction;

        // @ts-ignore
        expect(deployAction.props.accessControl).toBe("private");
    });
});

describe('dns', () => {
    test(`Does not create dns record if hostedZone is not provided`, () => {
        const stack = createStack(minimumProps);

        expect(stack).not.toHaveResourceLike("AWS::Route53::RecordSet");
    });

    test('creates DNS record if hosted-zone is provided', () => {
        const stack = createStack(withUrlAndCertProps);

        expect(stack).toHaveResourceLike("AWS::Route53::RecordSet", {
            "Name": `${withUrlAndCertProps.url}.`,
            "Type": "A",
            "AliasTarget": {
                "DNSName": {
                    "Fn::GetAtt": [
                        "mytestconstructsitedistributionCFDistributionAE8D5429",
                        "DomainName"
                    ]
                },
                "HostedZoneId": "Z2FDTNDATAQYW2"
            },
            "HostedZoneId": "ABCDEFGHIJKLMN"

        });
    });

    test('points to s3 bucket if certificate is not supplied', () => {
        const stack = createStack(withUrlProps);

        expect(stack).toHaveResourceLike("AWS::Route53::RecordSet", {
            "Name": `${withUrlProps.url}.`,
            "Type": "A",
            "AliasTarget": {
                "DNSName": "s3-website-us-east-1.amazonaws.com",
                "HostedZoneId": "Z3AQBSTGFYJSTF"
            },
            "HostedZoneId": "ABCDEFGHIJKLMN"

        });

    });
});
