require('dotenv').config();
const express = require('express');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const MCP_SECRET_KEY = process.env.MCP_SECRET_KEY || "poke_whatsapp_clickup_2024";
const CLICKUP_API_KEY = process.env.CLICKUP_API_KEY;

console.log('🚀 Starting Poke MCP Server with REAL WhatsApp...');

// ==================== REAL WHATSAPP CLIENT ====================
const whatsappClient = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

let isWhatsAppReady = false;
const pendingMessages = [];

// WhatsApp QR Code
whatsappClient.on('qr', (qr) => {
    console.log('\n📱 WHATSAPP QR CODE - Scan with your phone:');
    qrcode.generate(qr, { small: true });
    console.log('\n1. WhatsApp Web > Linked Devices > Link a Device');
    console.log('2. QR scan karo\n');
});

// WhatsApp Ready
whatsappClient.on('ready', () => {
    console.log('✅ WhatsApp CLIENT READY! Messages send/receive kar sakte hain.');
    isWhatsAppReady = true;
    
    // Process any pending messages
    pendingMessages.forEach(msg => {
        sendRealWhatsAppMessage(msg.phoneNumber, msg.message);
    });
    pendingMessages.length = 0;
});

// WhatsApp Message Received
whatsappClient.on('message', async (message) => {
    console.log('\n📩 NEW WHATSAPP MESSAGE RECEIVED:');
    console.log('From:', message.from);
    console.log('Message:', message.body);
    console.log('Timestamp:', message.timestamp);
    
    // Yahan aap message process kar sakte hain
    // Poke ko forward kar sakte hain
    // Database mein save kar sakte hain
});

whatsappClient.initialize();

// ==================== REAL WHATSAPP FUNCTIONS ====================
async function sendRealWhatsAppMessage(phoneNumber, message) {
    try {
        if (!isWhatsAppReady) {
            console.log('⏳ WhatsApp not ready, message queued...');
            pendingMessages.push({ phoneNumber, message });
            return {
                success: false,
                error: 'WhatsApp connecting... Please wait',
                queued: true
            };
        }

        // Format phone number
        let cleanedNumber = phoneNumber.replace(/\s+/g, '').replace(/[+-\s]/g, '');
        if (!cleanedNumber.startsWith('92') && cleanedNumber.length === 10) {
            cleanedNumber = '92' + cleanedNumber;
        }
        
        const chatId = `${cleanedNumber}@c.us`;
        
        console.log(`📤 SENDING REAL WhatsApp to: ${cleanedNumber}`);
        console.log(`💬 Message: ${message}`);
        
        const sentMessage = await whatsappClient.sendMessage(chatId, message);
        
        console.log('✅ REAL WhatsApp Message Sent!');
        
        return {
            success: true,
            messageId: sentMessage.id._serialized,
            to: cleanedNumber,
            timestamp: sentMessage.timestamp,
            message: `REAL WhatsApp sent to ${cleanedNumber} successfully!`
        };
    } catch (error) {
        console.error('❌ WhatsApp Send Error:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// ==================== CLICKUP FUNCTIONS ====================
async function createClickUpTask(taskName, description = '') {
    try {
        console.log('📤 Creating ClickUp Task:', taskName);
        
        // Get teams to find correct list
        const teamsResponse = await axios.get('https://api.clickup.com/api/v2/team', {
            headers: { 'Authorization': CLICKUP_API_KEY }
        });

        const teamId = teamsResponse.data.teams[0].id;
        const spacesResponse = await axios.get(`https://api.clickup.com/api/v2/team/${teamId}/space`, {
            headers: { 'Authorization': CLICKUP_API_KEY }
        });

        const spaceId = spacesResponse.data.spaces[0].id;
        const listsResponse = await axios.get(`https://api.clickup.com/api/v2/space/${spaceId}/list`, {
            headers: { 'Authorization': CLICKUP_API_KEY }
        });

        const listId = listsResponse.data.lists[0].id;

        // Create task
        const taskResponse = await axios.post(
            `https://api.clickup.com/api/v2/list/${listId}/task`,
            {
                name: taskName,
                description: description
            },
            {
                headers: {
                    'Authorization': CLICKUP_API_KEY,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('✅ ClickUp Task Created:', taskResponse.data.id);
        
        return {
            success: true,
            taskId: taskResponse.data.id,
            taskName: taskResponse.data.name,
            taskUrl: taskResponse.data.url,
            message: `Task "${taskName}" created successfully!`
        };
    } catch (error) {
        console.error('❌ ClickUp Error:', error.response?.data || error.message);
        return {
            success: false,
            error: error.response?.data?.err || error.message
        };
    }
}

// ==================== MCP TOOLS ENDPOINT ====================
const authenticateMCP = (req, res, next) => {
    const clientKey = req.headers['x-mcp-key'];
    if (!clientKey || clientKey !== MCP_SECRET_KEY) {
        return res.status(401).json({ success: false, error: 'Invalid MCP key' });
    }
    next();
};

app.post('/mcp/run', authenticateMCP, async (req, res) => {
    try {
        const { tool_name, parameters } = req.body;
        
        console.log('\n🛠️ MCP Tool Called:', tool_name);

        if (tool_name === 'create_clickup_task') {
            const { task_name, description = '' } = parameters;
            const result = await createClickUpTask(task_name, description);
            res.json(result);
        }
        
        else if (tool_name === 'send_whatsapp_message') {
            const { phone_number, message } = parameters;
            const result = await sendRealWhatsAppMessage(phone_number, message);
            res.json(result);
        }
        
        else if (tool_name === 'get_server_status') {
            res.json({
                success: true,
                status: 'running',
                services: {
                    clickup: 'real_api',
                    whatsapp: isWhatsAppReady ? 'connected' : 'connecting',
                    server: 'healthy'
                },
                timestamp: new Date().toISOString()
            });
        }
        
        else if (tool_name === 'get_whatsapp_qr') {
            // QR code status return karega
            res.json({
                success: true,
                whatsapp_status: isWhatsAppReady ? 'connected' : 'waiting_qr',
                message: isWhatsAppReady ? 'WhatsApp connected' : 'Scan QR code'
            });
        }
        
        else {
            res.json({ success: false, error: `Unknown tool: ${tool_name}` });
        }
        
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// ==================== WEBHOOK FOR MESSAGE RECEIVING ====================
app.post('/webhook/whatsapp', express.json(), (req, res) => {
    // Yahan incoming messages handle karenge
    console.log('📩 Webhook received:', req.body);
    res.json({ status: 'received' });
});

// Health Check
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        service: 'Poke MCP Server',
        whatsapp: isWhatsAppReady ? 'connected' : 'disconnected',
        clickup: 'real_api',
        timestamp: new Date().toISOString()
    });
});

app.listen(PORT, () => {
    console.log('\n🎉 POKE MCP SERVER WITH REAL WHATSAPP!');
    app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
    console.log(`🔑 MCP Key: ${MCP_SECRET_KEY}`);
    console.log('\n📋 Available Tools:');
    console.log('   • create_clickup_task - REAL ClickUp tasks');
    console.log('   • send_whatsapp_message - REAL WhatsApp messages');
    console.log('   • get_server_status - Check server health');
    console.log('   • get_whatsapp_qr - WhatsApp connection status');
    console.log('\n📱 WhatsApp QR code aayega...');
});