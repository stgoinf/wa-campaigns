"use server";
import { createClient } from '@/utils/supabase/server';

/**
 * Fetches templates from Meta WhatsApp Cloud API
 */
export async function getTemplates() {
  const supabase = await createClient();
  try {
    // 1. Get credentials from DB
    const { data: config, error: configError } = await supabase

      .from('configuracion')
      .select('*');

    if (configError) throw configError;

    const token = config.find(c => c.key === 'WABA_TOKEN')?.value;
    const businessId = config.find(c => c.key === 'WABA_BUSINESS_ID')?.value;

    if (!token || !businessId) {
      throw new Error('Faltan credenciales de WhatsApp en la configuración.');
    }

    // 2. Call Meta API
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${businessId}/message_templates?status=APPROVED&limit=100`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    return { success: true, templates: data.data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Sends a single WhatsApp message (Templated)
 */
export async function sendTemplateMessage({ phone, templateName, languageCode, components, phoneNumberId }) {
  const supabase = await createClient();
  try {
    // 1. Get token from DB
    const { data: config } = await supabase.from('configuracion').select('*');

    const token = config.find(c => c.key === 'WABA_TOKEN')?.value;

    if (!token) throw new Error('Token no encontrado');

    // 2. Call Meta Send API
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: phone,
          type: "template",
          template: {
            name: templateName,
            language: { code: languageCode },
            components: components
          }
        })
      }
    );

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    return { success: true, response: data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
