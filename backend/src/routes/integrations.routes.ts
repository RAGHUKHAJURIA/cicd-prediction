import { Router } from 'express';
import { SlackClient } from '../integrations/slack/slack-client';

export const integrationsRouter = Router();

integrationsRouter.post('/slack/test', async (req, res) => {
  const { webhookUrl } = req.body;
  if (!webhookUrl || !SlackClient.validate(webhookUrl)) {
    return res.status(400).json({ error: 'Invalid Slack webhook URL' });
  }

  const client = new SlackClient(webhookUrl);
  await client.send({
    text: '✅ CI/CD Reliability Intelligence Platform is now connected to this channel!'
  });

  res.json({ success: true });
});
