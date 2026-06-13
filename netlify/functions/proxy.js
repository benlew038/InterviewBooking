const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxl-Di2ByjvsZjrLNVpDMctrd04rLmawmUZu-sOVJByp7q1kmeulGPvBros1xY4VP1x/exec';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: CORS_HEADERS,
      body: '',
    };
  }

  const method = event.httpMethod || 'GET';

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
      redirect: 'follow',
    });

    const text = await response.text();

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        ...CORS_HEADERS,
      },
      body: text,
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        ...CORS_HEADERS,
      },
      body: JSON.stringify({ error: 'Proxy request failed', detail: String(error) }),
    };
  }
};
