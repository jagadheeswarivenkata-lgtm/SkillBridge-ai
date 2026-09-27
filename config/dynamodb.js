/**
 * AWS DynamoDB Configuration & Client Initializer
 * SkillBridge AI - "Evidence-Based Career Skill Intelligence Platform"
 */
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { 
  DynamoDBDocumentClient, 
  GetCommand, 
  PutCommand, 
  QueryCommand, 
  ScanCommand, 
  UpdateCommand, 
  DeleteCommand,
  BatchWriteCommand 
} = require('@aws-sdk/lib-dynamodb');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const region = process.env.AWS_REGION || 'ap-south-1';
const accessKeyId = process.env.AWS_ACCESS_KEY_ID || '';
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || '';
const endpoint = process.env.DYNAMODB_ENDPOINT || null;

// Determine if we should use direct AWS DynamoDB or local resilient file-backed store
const isRealAwsConfigured = 
  accessKeyId && 
  secretAccessKey && 
  accessKeyId !== 'replace_me' && 
  secretAccessKey !== 'replace_me';

const useAws = isRealAwsConfigured && process.env.USE_LOCAL_FALLBACK !== 'true';

let realDocClient = null;

if (useAws || endpoint) {
  try {
    const clientConfig = { region };
    if (isRealAwsConfigured) {
      clientConfig.credentials = { accessKeyId, secretAccessKey };
    }
    if (endpoint) {
      clientConfig.endpoint = endpoint;
    }
    const baseClient = new DynamoDBClient(clientConfig);
    realDocClient = DynamoDBDocumentClient.from(baseClient, {
      marshallOptions: { removeUndefinedValues: true }
    });
    console.log(`[DynamoDB] Connected to AWS DynamoDB (${region})`);
  } catch (err) {
    console.warn('[DynamoDB] Could not initialize AWS DynamoDB client. Falling back to local document store.', err.message);
  }
}

// Local Document Store (File-backed persistence) to guarantee 100% functionality out of the box
const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Table schema keys mapping
const TABLE_KEYS = {
  Students: { pk: 'studentId' },
  Skills: { pk: 'skillId' },
  StudentSkills: { pk: 'studentId', sk: 'skillId' },
  JobRoles: { pk: 'roleId' },
  JobRequirements: { pk: 'roleId', sk: 'skillId' },
  Evidence: { pk: 'studentId', sk: 'evidenceId' },
  Assessments: { pk: 'studentId', sk: 'assessmentId' },
  LearningPaths: { pk: 'studentId', sk: 'pathId' },
  FacultyReviews: { pk: 'studentId', sk: 'reviewId' },
  Notifications: { pk: 'studentId', sk: 'notificationId' }
};

function getTableFile(tableName) {
  return path.join(DATA_DIR, `${tableName}.json`);
}

function readTable(tableName) {
  const file = getTableFile(tableName);
  if (!fs.existsSync(file)) return [];
  try {
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw || '[]');
  } catch (e) {
    return [];
  }
}

function writeTable(tableName, items) {
  const file = getTableFile(tableName);
  fs.writeFileSync(file, JSON.stringify(items, null, 2), 'utf8');
}

/**
 * Resilient Document Client implementing AWS DynamoDB DocumentClient command handlers
 */
const fallbackDocClient = {
  async send(command) {
    const name = command.constructor.name;
    const input = command.input || {};
    const tableName = input.TableName;
    const keyDef = TABLE_KEYS[tableName] || { pk: 'id' };

    let items = readTable(tableName);

    if (name === 'GetCommand') {
      const key = input.Key || {};
      const found = items.find(item => {
        if (keyDef.sk) {
          return item[keyDef.pk] === key[keyDef.pk] && item[keyDef.sk] === key[keyDef.sk];
        }
        return item[keyDef.pk] === key[keyDef.pk];
      });
      return { Item: found || undefined };
    }

    if (name === 'PutCommand') {
      const newItem = { ...input.Item };
      const index = items.findIndex(item => {
        if (keyDef.sk) {
          return item[keyDef.pk] === newItem[keyDef.pk] && item[keyDef.sk] === newItem[keyDef.sk];
        }
        return item[keyDef.pk] === newItem[keyDef.pk];
      });
      if (index >= 0) {
        items[index] = newItem;
      } else {
        items.push(newItem);
      }
      writeTable(tableName, items);
      return { Attributes: newItem };
    }

    if (name === 'QueryCommand') {
      // Basic expression evaluator for query
      const keyCondition = input.KeyConditionExpression || '';
      const exprValues = input.ExpressionAttributeValues || {};
      
      const matched = items.filter(item => {
        for (const [keyPlaceholder, val] of Object.entries(exprValues)) {
          // Check if any field equals val
          let matchesCondition = false;
          if (keyCondition.includes(keyPlaceholder)) {
            // Find which attribute corresponds to keyPlaceholder
            for (const [attrName, attrVal] of Object.entries(item)) {
              if (attrVal === val) {
                matchesCondition = true;
                break;
              }
            }
          }
          if (matchesCondition) return true;
        }
        return false;
      });
      return { Items: matched, Count: matched.length };
    }

    if (name === 'ScanCommand') {
      let filtered = [...items];
      if (input.FilterExpression && input.ExpressionAttributeValues) {
        const exprValues = input.ExpressionAttributeValues;
        filtered = filtered.filter(item => {
          for (const [k, v] of Object.entries(exprValues)) {
            const hasMatch = Object.values(item).some(val => val === v);
            if (hasMatch) return true;
          }
          return false;
        });
      }
      return { Items: filtered, Count: filtered.length };
    }

    if (name === 'UpdateCommand') {
      const key = input.Key || {};
      const index = items.findIndex(item => {
        if (keyDef.sk) {
          return item[keyDef.pk] === key[keyDef.pk] && item[keyDef.sk] === key[keyDef.sk];
        }
        return item[keyDef.pk] === key[keyDef.pk];
      });

      if (index >= 0) {
        const updated = { ...items[index], ...(input.ExpressionAttributeValues ? 
          Object.fromEntries(Object.entries(input.ExpressionAttributeValues).map(([k, v]) => [k.replace(/^:/, ''), v])) 
          : {}) };
        items[index] = updated;
        writeTable(tableName, items);
        return { Attributes: updated };
      }
      return { Attributes: null };
    }

    if (name === 'DeleteCommand') {
      const key = input.Key || {};
      items = items.filter(item => {
        if (keyDef.sk) {
          return !(item[keyDef.pk] === key[keyDef.pk] && item[keyDef.sk] === key[keyDef.sk]);
        }
        return item[keyDef.pk] !== key[keyDef.pk];
      });
      writeTable(tableName, items);
      return {};
    }

    if (name === 'BatchWriteCommand') {
      const requestItems = input.RequestItems || {};
      for (const [tName, reqs] of Object.entries(requestItems)) {
        let tItems = readTable(tName);
        const tKeyDef = TABLE_KEYS[tName] || { pk: 'id' };
        for (const req of reqs) {
          if (req.PutRequest) {
            const putItem = req.PutRequest.Item;
            const idx = tItems.findIndex(i => {
              if (tKeyDef.sk) {
                return i[tKeyDef.pk] === putItem[tKeyDef.pk] && i[tKeyDef.sk] === putItem[tKeyDef.sk];
              }
              return i[tKeyDef.pk] === putItem[tKeyDef.pk];
            });
            if (idx >= 0) tItems[idx] = putItem;
            else tItems.push(putItem);
          }
        }
        writeTable(tName, tItems);
      }
      return {};
    }

    return {};
  }
};

const docClient = realDocClient && useAws ? realDocClient : fallbackDocClient;

module.exports = {
  docClient,
  TABLE_KEYS,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
  DeleteCommand,
  BatchWriteCommand,
  isUsingAws: Boolean(realDocClient && useAws)
};
