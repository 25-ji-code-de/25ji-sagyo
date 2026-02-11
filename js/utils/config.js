// SEKAI Pass OAuth 配置
const CONFIG = {
    clientId: '25ji_client',
    authEndpoint: 'https://id.nightcord.de5.net/oauth/authorize',
    tokenEndpoint: 'https://id.nightcord.de5.net/oauth/token',
    userInfoEndpoint: 'https://id.nightcord.de5.net/oauth/userinfo',
    redirectUri: `${window.location.origin}/callback.html`,
    scope: 'openid profile email',
    apiBaseUrl: 'https://api.nightcord.de5.net'
};

window.SEKAI_CONFIG = CONFIG;
