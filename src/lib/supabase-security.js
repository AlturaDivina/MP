import { supabaseAdmin } from './supabase';
import { logError, logInfo } from '../utils/logger';

/**
 * Validador seguro para operaciones sensibles
 */
export class SupabaseSecurity {
  
  /**
   * Insertar payment request con validación extra
   */
  static async insertPaymentRequest(paymentData) {
    try {
      // Validaciones extra antes de insertar
      if (!paymentData.payment_id || !paymentData.customer_data?.email) {
        throw new Error('Datos de pago incompletos');
      }
      
      const { data, error } = await supabaseAdmin
        .from('payment_requests')
        .insert([paymentData])
        .select()
        .single();
        
      if (error) {
        logError('Error insertando payment request:', error);
        throw error;
      }
      
      logInfo('Payment request insertado correctamente:', data.id);
      return { data, error: null };
      
    } catch (error) {
      logError('Error en insertPaymentRequest:', error);
      return { data: null, error };
    }
  }
  
  /**
   * Leer productos (puede usar cliente público)
   */
  static async getProducts() {
    const { data, error } = await supabaseAdmin
      .from('products')
      .select('*')
      .eq('active', true);
      
    return { data, error };
  }
}