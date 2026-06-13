const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxl-Di2ByjvsZjrLNVpDMctrd04rLmawmUZu-sOVJByp7q1kmeulGPvBros1xY4VP1x/exec';

exports.handler = async (event) => {
  const method = event.httpMethod || 'GET';

  if (method === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
      body: '',
    };
  }

  const params = event.queryStringParameters || {};
  const url = `${APPS_SCRIPT_URL}${method === 'GET' ? `?${new URLSearchParams(params).toString()}` : ''}`;

  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: method === 'POST' ? event.body || null : undefined,
    });

    const text = await response.text();

    return {
      statusCode: response.status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
      body: text,
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: 'Proxy request failed', detail: String(error) }),
    };
  }
};
