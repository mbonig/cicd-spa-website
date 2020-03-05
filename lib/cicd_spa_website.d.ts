import { Construct, SecretValue, StackProps } from '@aws-cdk/core';
import { Bucket } from "@aws-cdk/aws-s3";
import { HostedZoneAttributes } from "@aws-cdk/aws-route53";
import { ICertificate } from "@aws-cdk/aws-certificatemanager";
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
    readonly hostedZone?: HostedZoneAttributes;
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
export declare const DEFAULT_BUILD_SPEC: {
    version: string;
    phases: {
        install: {
            "runtime-versions": {
                "nodejs": string;
            };
        };
        build: {
            commands: string[];
        };
    };
    artifacts: {
        files: string[];
        "base-directory": string;
    };
};
export declare class CicdSpaWebsite extends Construct {
    websiteBucket: Bucket;
    private buildArtifactBucket;
    private distribution;
    private props;
    private oai;
    constructor(scope: Construct, id: string, props: CicdSpaWebsiteProps);
    setupBucket(): void;
    setupRoute53(): void;
    private setupCodePipeline;
    private setupCloudFront;
}
