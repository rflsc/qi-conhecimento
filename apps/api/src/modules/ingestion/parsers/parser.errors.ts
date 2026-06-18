export class DoclingRequiredError extends Error {
  constructor(
    message: string,
    readonly reason: 'not_configured' | 'unavailable' | 'parse_failed',
    readonly detail?: string,
  ) {
    super(message);
    this.name = 'DoclingRequiredError';
  }
}
