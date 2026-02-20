# Gemini OAuth Setup Instructions

## What you need to do:

1. **Visit Google OAuth URL**: https://accounts.google.com/oauth/authorize?client_id=764086051850-6qr4p6gpi6hn506pt8ejuq83di341hur.apps.googleusercontent.com&redirect_uri=urn:ietf:wg:oauth:2.0:oob&scope=https://www.googleapis.com/auth/generative-language&response_type=code

2. **Authenticate**: 
   - Log in with your Google account that has the Gemini Advanced/Pro subscription
   - Grant permissions when prompted

3. **Get Authorization Code**:
   - After authentication, Google will show you an authorization code
   - Copy this code (it will look like: `4/0AXXXXXxxxxxxx...`)

4. **Exchange for Tokens**: 
   - We'll use this code to get your OAuth tokens and save them in the container

## Why this works:
- Uses the official Google Gemini CLI OAuth client ID
- Leverages your existing Gemini subscription billing
- Higher quotas than API keys
- Secure token-based authentication

Let me know when you have the authorization code and I'll help you complete the setup in the container.