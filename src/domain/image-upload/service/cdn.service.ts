// cdn.service.ts
export class CdnService {
  private domain = process.env.CLOUDFRONT_DOMAIN!; // dxxxx.cloudfront.net
  publicUrl(key: string) {
    return `https://${this.domain}/${encodeURI(key)}`;
  }
}
