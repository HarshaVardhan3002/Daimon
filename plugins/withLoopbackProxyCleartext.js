const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');

const NETWORK_SECURITY_CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false" />
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="false">127.0.0.1</domain>
  </domain-config>
</network-security-config>
`;

function withLoopbackProxyCleartext(config) {
  config = withAndroidManifest(config, (modConfig) => {
    const application = modConfig.modResults.manifest.application?.[0];
    if (!application) throw new Error('Android manifest is missing its application element');
    application.$ ??= {};
    application.$['android:networkSecurityConfig'] = '@xml/network_security_config';
    delete application.$['android:usesCleartextTraffic'];
    return modConfig;
  });

  return withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const resourceDir = path.join(
        modConfig.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'res',
        'xml',
      );
      await fs.promises.mkdir(resourceDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(resourceDir, 'network_security_config.xml'),
        NETWORK_SECURITY_CONFIG,
        'utf8',
      );
      return modConfig;
    },
  ]);
}

module.exports = withLoopbackProxyCleartext;
