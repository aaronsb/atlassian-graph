import { GraphQLClient } from 'graphql-request';
import { getIntrospectionQuery } from 'graphql';
import dotenv from 'dotenv';
import fs from 'fs/promises';

// Load environment variables
dotenv.config();

async function fetchIntrospectionSchema() {
  const email = process.env.ATLASSIAN_EMAIL;
  const apiToken = process.env.ATLASSIAN_API_TOKEN;
  
  if (!email || !apiToken) {
    console.error('Missing ATLASSIAN_EMAIL or ATLASSIAN_API_TOKEN in .env file');
    process.exit(1);
  }
  
  const auth = Buffer.from(`${email}:${apiToken}`).toString('base64');
  
  const client = new GraphQLClient('https://api.atlassian.com/graphql', {
    headers: {
      'Authorization': `Basic ${auth}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'X-ExperimentalApi': 'WorkManagementFields'
    }
  });
  
  try {
    console.log('Fetching GraphQL introspection schema...');
    
    // Get the introspection query
    const introspectionQuery = getIntrospectionQuery();
    
    // Execute the introspection
    const schema = await client.request(introspectionQuery);
    
    // Save the introspection result
    await fs.writeFile(
      'introspection-schema.json', 
      JSON.stringify(schema, null, 2)
    );
    
    console.log('✓ Introspection schema saved to introspection-schema.json');
    console.log('  This file can be used by GraphQL Explorer for offline schema browsing');
    
  } catch (error) {
    console.error('Error fetching introspection:', error.message);
    if (error.response) {
      console.error('Response:', error.response);
    }
  }
}

fetchIntrospectionSchema();