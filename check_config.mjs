import { getDefaultConfig } from 'expo/metro-config';
const config = getDefaultConfig(import.meta.dirname, { env: { EXPO_USE_HERMES: 'false' } });
console.log('transformer:', JSON.stringify(config.transformer, null, 2));
console.log('transformerPath:', config.transformerPath);