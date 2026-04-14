"use server";

/**
 * Tests the WhatsApp Cloud API credentials
 */
export async function testWhatsAppConnection({ businessId, token, phoneNumberId }) {
  if (!businessId || !token || !phoneNumberId) {
    return { 
      success: false, 
      error: 'Por favor, completa todos los campos para realizar la prueba.' 
    };
  }

  try {
    // 1. Test Business ID and Token by fetching business metadata
    const wabaResponse = await fetch(
      `https://graph.facebook.com/v21.0/${businessId}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );

    const wabaData = await wabaResponse.json();
    if (wabaData.error) {
      throw new Error(`Error de Business ID/Token: ${wabaData.error.message}`);
    }

    // 2. Test Phone Number ID by fetching its status
    const phoneResponse = await fetch(
      `https://graph.facebook.com/v21.0/${phoneNumberId}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );

    const phoneData = await phoneResponse.json();
    if (phoneData.error) {
      throw new Error(`Error de Phone Number ID: ${phoneData.error.message}`);
    }

    return { 
      success: true, 
      message: '¡Conexión exitosa! Las credenciales son válidas.',
      details: {
        businessName: wabaData.name,
        verifiedName: phoneData.verified_name,
        displayPhoneNumber: phoneData.display_phone_number
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
