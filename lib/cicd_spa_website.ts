import {Construct, SecretValue, StackProps} from '@aws-cdk/core';
import {Artifact, Pipeline} from "@aws-cdk/aws-codepipeline";
import {BlockPublicAccess, Bucket, BucketEncryption} from "@aws-cdk/aws-s3";
import {HostedZone, HostedZoneAttributes, RecordSet, RecordTarget, RecordType} from "@aws-cdk/aws-route53";
import {
    CodeBuildAction,
    GitHubSourceAction,
    LambdaInvokeAction,
    S3DeployAction
} from "@aws-cdk/aws-codepipeline-actions";
import {BuildSpec, ComputeType, LinuxBuildImage, PipelineProject} from "@aws-cdk/aws-codebuild";
import {CloudFrontWebDistribution, OriginAccessIdentity, ViewerCertificate} from "@aws-cdk/aws-cloudfront";
import {Effect, PolicyStatement} from "@aws-cdk/aws-iam";
import {Code, Function, Runtime} from '@aws-cdk/aws-lambda';
import {DnsValidatedCertificate, ICertificate} from "@aws-cdk/aws-certificatemanager";
import {BucketWebsiteTarget, CloudFrontTarget} from "@aws-cdk/aws-route53-targets";

export interface CicdSpaWebsiteProps extends StackProps {
    /**
     * The url for the website.
     * e.g. www.fourlittledogs.com
     */
    readonly url: string;

    /**
     * a limited schema version of GitHubSourceActionProps
     */
    readonly githubSource: ReducedGitHubSourceActionProps;

    readonly buildSpec?: any | string;
    /**
     * A certificate to use, or true if you'd like a DnsValidatedCertificate to be generated
     * If provided, also requires the hostedZone to be provided.
     * If you do not provide a certificate or set this to false, then CloudFormation and the related DNS records will not be created, and the website will be hosted using S3
     */
    readonly certificate?: ICertificate | boolean;

    /**
     * The HostedZoneAttributes to use for a HostedZone lookup. This is required if you want the DNS entry and are using Certificate generation (instead of providing your own)
     */
    readonly hostedZone?: HostedZoneAttributes
}

export interface ReducedGitHubSourceActionProps {
    /**
     * The GitHub account/user that owns the repo.
     */
    readonly owner: string;
    /**
     * The name of the repo, without the username.
     */
    readonly repo: string;
    /**
     * The branch to use.
     *
     * @default "master"
     */
    readonly branch?: string;
    /**
     * A GitHub OAuth token to use for authentication.
     *
     * It is recommended to use a Secrets Manager `Secret` to obtain the token:
     *
     *   const oauth = cdk.SecretValue.secretsManager('my-github-token');
     *   new GitHubSource(this, 'GitHubAction', { oauthToken: oauth, ... });
     */
    readonly oauthToken: SecretValue;
}


let standardBuildSpec = {
    version: '0.2',
    phases: {
        install: {
            "runtime-versions": {
                "nodejs": "12"
            }
        },
        build: {
            commands: [
                'npm install',
                `npm run build`
            ],
        },
    },
    artifacts: {
        files: ["**/*"],
        "base-directory": "dist"
    }
};

export const DEFAULT_BUILD_SPEC = standardBuildSpec;

export class CicdSpaWebsite extends Construct {
    // @ts-ignore
    websiteBucket: Bucket;
    // @ts-ignore
    private buildArtifactBucket: Bucket;
    // @ts-ignore
    private distribution: CloudFrontWebDistribution;
    private props: CicdSpaWebsiteProps;
    // @ts-ignore
    private oai: OriginAccessIdentity;

    constructor(scope: Construct, id: string, props: CicdSpaWebsiteProps) {
        super(scope, id);

        this.props = props;
        this.setupBucket();
        this.setupCloudFront();
        this.setupRoute53();
        this.setupCodePipeline();
    }

    setupBucket() {

        this.buildArtifactBucket = new Bucket(this, 'build-artifact-bucket', {
            encryption: BucketEncryption.KMS_MANAGED,
            bucketName: `${this.props.url.replace(/\./gi, '-')}-artifacts`,
            publicReadAccess: false,
            blockPublicAccess: BlockPublicAccess.BLOCK_ALL
        });


        this.websiteBucket = new Bucket(this, 'website-bucket', {
            bucketName: `${this.props.url}`,
            ...(!this.props.certificate ? {
                websiteIndexDocument: 'index.html',
                websiteErrorDocument: 'index.html',
                publicReadAccess: true
            } : {})
        });

        if (this.props.certificate) {
            this.oai = new OriginAccessIdentity(this, 'oai', {});
            this.websiteBucket.addToResourcePolicy(new PolicyStatement({
                actions: ["s3:GetObject"],
                principals: [this.oai.grantPrincipal]
            }))
        }

    }

    setupRoute53() {
        if (this.props.hostedZone) {
            const hostedZone = HostedZone.fromHostedZoneAttributes(this, 'zone', this.props.hostedZone);

            const recordName = this.props.url.split('.')[0];
            let target = RecordTarget.fromAlias(new CloudFrontTarget(this.distribution));
            if (!this.props.certificate) {
                target = RecordTarget.fromAlias(new BucketWebsiteTarget(this.websiteBucket))
            }
            new RecordSet(this, 'website-dns', {
                recordType: RecordType.A,
                recordName,
                zone: hostedZone,
                target: target
            });
        }

    }

    private setupCodePipeline() {
        let sourceArtifact = new Artifact('source-code');
        let compiledSite = new Artifact("built-site");

        let buildSpec = BuildSpec.fromObject(DEFAULT_BUILD_SPEC);
        if (this.props.buildSpec) {
            if (typeof (this.props.buildSpec) === "object") {
                buildSpec = BuildSpec.fromObject(this.props.buildSpec);
            } else if (typeof (this.props.buildSpec) === "string") {
                buildSpec = BuildSpec.fromSourceFilename(this.props.buildSpec);
            }
        }
        const project = new PipelineProject(this, `build-project`, {
            buildSpec,
            environment: {
                buildImage: LinuxBuildImage.AMAZON_LINUX_2_2,
                computeType: ComputeType.SMALL,
                privileged: true
            }
        });

        let accessControl = "public-read";

        if (this.props.certificate) {
            accessControl = "private";
        }

        const s3DeployAction = new S3DeployAction({
            actionName: 'copy-files',
            bucket: this.websiteBucket!,
            input: compiledSite,
            runOrder: 1,
            // @ts-ignore
            accessControl
        });

        const invalidateLambda = new Function(this, 'invalidate-function', {
            code: Code.fromAsset('./lib/handlers/invalidate-cache'),
            environment: {},
            handler: "index.handler",
            runtime: Runtime.NODEJS_10_X
        });

        invalidateLambda.addToRolePolicy(new PolicyStatement({
            effect: Effect.ALLOW,
            actions: [
                "codepipeline:PutJobSuccessResult",
                "cloudfront:CreateInvalidation"
            ],
            resources: ["*"]
        }));

        const invalidateCache = new LambdaInvokeAction({
            actionName: "invalidate-cache",
            lambda: invalidateLambda,
            // @ts-ignore
            userParameters: this.distribution?.distributionId,
            runOrder: 2
        });

        let deployActions = [
            s3DeployAction
        ];

        if (this.props.certificate) {
            deployActions.push(invalidateCache);
        }

        const pipeline = new Pipeline(this, "build-pipeline", {
            artifactBucket: this.buildArtifactBucket,
            pipelineName: `${this.props.url.replace(/\./gi, '-')}-build-pipeline`,
            stages: [
                {
                    stageName: "pull", actions: [
                        new GitHubSourceAction({
                            ...this.props.githubSource,
                            output: sourceArtifact,
                            actionName: "pull-from-github"
                        })
                    ]
                },
                {
                    stageName: "build", actions: [
                        new CodeBuildAction({
                            actionName: 'build',
                            input: sourceArtifact,
                            outputs: [compiledSite],
                            project
                        })
                    ]
                },
                {
                    stageName: "deploy", actions: deployActions
                },
            ]
        });

        pipeline.addToRolePolicy(new PolicyStatement({
            actions: [
                "s3:DeleteObject*",
                "s3:PutObject*",
                "s3:Abort*"
            ],
            resources: [
                this.websiteBucket.bucketArn,
                `${this.websiteBucket.bucketArn}/*`
            ],
            effect: Effect.ALLOW
        }));
    }

    private setupCloudFront() {
        let certificateToUse = this.props.certificate;
        if (certificateToUse) {
            let certificate;
            if (typeof (certificateToUse) === "boolean") {
                if (!this.props.hostedZone) {
                    throw new Error("If you'd like a certificate then you must provide a `hostedZone`.")
                }
                certificate = new DnsValidatedCertificate(this, 'certificate', {
                    domainName: this.props.url,
                    hostedZone: HostedZone.fromHostedZoneAttributes(this, 'hosted-zone', this.props.hostedZone)
                });
            } else {
                certificate = certificateToUse;
            }


            this.distribution = new CloudFrontWebDistribution(this, 'site-distribution', {
                viewerCertificate: ViewerCertificate.fromAcmCertificate(certificate),

                originConfigs: [
                    {
                        s3OriginSource: {
                            s3BucketSource: this.websiteBucket,
                            originAccessIdentity: this.oai
                        },
                        behaviors: [{isDefaultBehavior: true}]
                    }
                ]
            });
        }

    }
}
