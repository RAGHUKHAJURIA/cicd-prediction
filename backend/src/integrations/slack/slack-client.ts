export interface SlackMessage {
  text?: string;
  blocks?: any[];
  attachments?: any[];
}

export class SlackClient {
  constructor(private webhookUrl: string) {}

  async send(message: SlackMessage): Promise<void> {
    if (!this.webhookUrl) return;

    try {
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      });

      if (response.status === 429) {
        // Simple retry once
        await new Promise(r => setTimeout(r, 2000));
        await fetch(this.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(message),
        });
      }
    } catch (e) {
      console.error('Failed to send Slack alert', e);
    }
  }

  async sendBlocks(blocks: any[]): Promise<void> {
    await this.send({ blocks });
  }

  static validate(webhookUrl: string): boolean {
    return webhookUrl.startsWith('https://hooks.slack.com/');
  }
}
