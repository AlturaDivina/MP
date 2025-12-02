import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { logInfo, logError } from '../utils/logger';

/**
 * Genera un PDF de recibo de compra con los detalles del pedido
 */
export async function generateReceiptPDF({
  orderId,
  customerData,
  items,
  subtotalAmount, // ✅ NUEVO parámetro
  shippingFee, // ✅ NUEVO parámetro
  totalAmount,
  paymentStatus,
  paymentId,
  displayMode,
  discountAmount = 0,
  discountCode = null
}) {
  try {
    logInfo(`📄 [${orderId}] Iniciando generación de PDF con pdf-lib`);
    
    // Crear documento PDF
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]); // A4 size
    
    // Obtener fuentes estándar
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    const { width, height } = page.getSize();
    let yPosition = height - 50;
    
    // Header
    page.drawText('ALTURA DIVINA', {
      x: 50,
      y: yPosition,
      size: 20,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
    
    yPosition -= 30;
    page.drawText('Recibo de Compra', {
      x: 50,
      y: yPosition,
      size: 16,
      font: font,
      color: rgb(0, 0, 0),
    });
    // Badge Family & Friends
  if (displayMode === 'family') {
      page.drawText('[Family & Friends]', {
        x: 220,
        y: yPosition,
        size: 12,
        font: boldFont,
        color: rgb(0.05, 0.35, 0.85)
      });
    }
    
    // Order info
    yPosition -= 40;
    page.drawText(`Pedido: #${orderId}`, { x: 50, y: yPosition, size: 12, font });
    yPosition -= 20;
    page.drawText(`Fecha: ${new Date().toLocaleDateString('es-MX')}`, { x: 50, y: yPosition, size: 12, font });
    yPosition -= 20;
    page.drawText(`Estado: ${paymentStatus === 'approved' ? 'Confirmado' : 'Pendiente'}`, { x: 50, y: yPosition, size: 12, font });
    yPosition -= 20;
    page.drawText(`ID de Pago: ${paymentId}`, { x: 50, y: yPosition, size: 12, font });
    
    // Customer info
    yPosition -= 40;
    page.drawText('DATOS DEL CLIENTE:', { x: 50, y: yPosition, size: 14, font: boldFont });
    yPosition -= 25;
    page.drawText(`Nombre: ${customerData.first_name || ''} ${customerData.last_name || ''}`, { x: 50, y: yPosition, size: 10, font });
    yPosition -= 15;
    page.drawText(`Email: ${customerData.email || 'No proporcionado'}`, { x: 50, y: yPosition, size: 10, font });
    yPosition -= 15;
    page.drawText(`Teléfono: ${customerData.phone || 'No proporcionado'}`, { x: 50, y: yPosition, size: 10, font });
    // Direcciones (nueva sección)
    const ship = customerData.shipping_address || customerData.address || {};
    const billing = customerData.billing_address || {};
    const billingSame = customerData.billing_same_as_shipping !== false && Object.keys(billing).length === 0 ? true : JSON.stringify(ship) === JSON.stringify(billing);
    yPosition -= 25;
    page.drawText('DIRECCIONES:', { x: 50, y: yPosition, size: 12, font: boldFont });
    yPosition -= 18;
    page.drawText(`Envío: ${(ship.street_name||'')} ${(ship.street_number||'')}, ${(ship.city||'')}, ${(ship.state||'')} ${(ship.zip_code||'')} ${(ship.country||'')}`, { x:50, y: yPosition, size: 9, font });
    if (!billingSame) {
      yPosition -= 14;
      page.drawText(`Facturación: ${(billing.street_name||'')} ${(billing.street_number||'')}, ${(billing.city||'')}, ${(billing.state||'')} ${(billing.zip_code||'')} ${(billing.country||'')}`, { x:50, y: yPosition, size: 9, font });
    }
    
    // Items
    yPosition -= 40;
    page.drawText('PRODUCTOS:', { x: 50, y: yPosition, size: 14, font: boldFont });
    yPosition -= 25;
    
    // Table headers
    page.drawText('Producto', { x: 50, y: yPosition, size: 10, font: boldFont });
    page.drawText('Cantidad', { x: 300, y: yPosition, size: 10, font: boldFont });
    page.drawText('Precio Unit.', { x: 380, y: yPosition, size: 10, font: boldFont });
    page.drawText('Subtotal', { x: 480, y: yPosition, size: 10, font: boldFont });
    yPosition -= 20;
    
    // Items
    for (const item of items) {
      const itemPrice = parseFloat(item.price) || 0;
      const itemQuantity = parseInt(item.quantity) || 1;
      const itemSubtotal = itemPrice * itemQuantity;
      
      const itemName = (item.name || 'Producto').length > 30 
        ? (item.name || 'Producto').substring(0, 30) + '...'
        : (item.name || 'Producto');
      
      page.drawText(itemName, { x: 50, y: yPosition, size: 10, font });
      page.drawText(itemQuantity.toString(), { x: 300, y: yPosition, size: 10, font });
      page.drawText(`$${itemPrice.toFixed(2)}`, { x: 380, y: yPosition, size: 10, font });
      page.drawText(`$${itemSubtotal.toFixed(2)}`, { x: 480, y: yPosition, size: 10, font });
      yPosition -= 20;
    }
    
    // NUEVO: Agregar línea de cargo de envío (usar fee provisto)
    yPosition -= 10;
    const fee = Number(shippingFee || 0);
    if (fee > 0) {
      page.drawText('Cargo de envío', { x: 50, y: yPosition, size: 10, font });
      page.drawText('1', { x: 300, y: yPosition, size: 10, font });
      page.drawText(`$${fee.toFixed(2)}`, { x: 380, y: yPosition, size: 10, font });
      page.drawText(`$${fee.toFixed(2)}`, { x: 480, y: yPosition, size: 10, font });
      yPosition -= 20;
    }

    // NUEVO: Línea de descuento si aplica
    const disc = Number(discountAmount || 0);
    if (disc > 0) {
      const label = `Descuento${discountCode ? ` (${discountCode})` : ''}`;
      page.drawText(label, { x: 50, y: yPosition, size: 10, font });
      page.drawText('1', { x: 300, y: yPosition, size: 10, font });
      page.drawText(`-$${disc.toFixed(2)}`, { x: 380, y: yPosition, size: 10, font });
      page.drawText(`-$${disc.toFixed(2)}`, { x: 480, y: yPosition, size: 10, font });
      yPosition -= 20;
    }
    
    // ========== DESGLOSE COMPLETO DE PRECIOS ==========
    yPosition -= 10;
    page.drawLine({ start: { x: 50, y: yPosition }, end: { x: 545, y: yPosition }, thickness: 1, color: rgb(0.8, 0.8, 0.8) });
    yPosition -= 20;
    
    // Subtotal de productos (sin envío ni descuentos)
    const subtotal = subtotalAmount != null ? Number(subtotalAmount) : items.reduce((sum, item) => sum + (parseFloat(item.price) * parseInt(item.quantity)), 0);
    page.drawText('Subtotal de productos:', { x: 300, y: yPosition, size: 11, font });
    page.drawText(`$${subtotal.toFixed(2)}`, { x: 480, y: yPosition, size: 11, font });
    yPosition -= 18;
    
    // Descuento en productos
    if (disc > 0) {
      const label = `Descuento${discountCode ? ` (${discountCode})` : ''}:`;
      page.drawText(label, { x: 300, y: yPosition, size: 11, font });
      page.drawText(`-$${disc.toFixed(2)}`, { x: 480, y: yPosition, size: 11, font, color: rgb(0.8, 0, 0) });
      yPosition -= 18;
    }
    
    // Cargo de envío
    page.drawText('Cargo de envío:', { x: 300, y: yPosition, size: 11, font });
    page.drawText(`$${fee.toFixed(2)}`, { x: 480, y: yPosition, size: 11, font });
    yPosition -= 18;
    
    // Línea separadora antes del total
    page.drawLine({ start: { x: 300, y: yPosition }, end: { x: 545, y: yPosition }, thickness: 2, color: rgb(0, 0, 0) });
    yPosition -= 25;
    
    // Total final
    page.drawText('TOTAL A PAGAR:', { x: 300, y: yPosition, size: 14, font: boldFont });
    page.drawText(`$${parseFloat(totalAmount).toFixed(2)}`, { 
      x: 480, 
      y: yPosition, 
      size: 16, 
      font: boldFont,
      color: rgb(0, 0.5, 0)
    });
    
  // NUEVO: Agregar nota de verificación de edad con fecha
    yPosition -= 40;
    page.drawText('VERIFICACIÓN DE EDAD:', { 
      x: 50, 
      y: yPosition, 
      size: 8, 
      font: boldFont 
    });
    yPosition -= 15;
    
    // Calcular edad desde fecha de nacimiento
    let ageText = 'No especificada';
    if (customerData.birth_date) {
      const birthDate = new Date(customerData.birth_date);
      const today = new Date();
      const calculatedAge = Math.floor((today - birthDate) / (365.25 * 24 * 60 * 60 * 1000));
      ageText = `${calculatedAge} años (Nacimiento: ${customerData.birth_date})`;
    }
    
    page.drawText(`Cliente confirmó ser mayor de 18 años (${ageText})`, { 
      x: 50, 
      y: yPosition, 
      size: 8, 
      font 
    });
    
    // Footer
    yPosition -= 50;
    page.drawText('Gracias por su compra - Altura Divina', { 
      x: 50, 
      y: yPosition, 
      size: 8, 
      font 
    });
    
    // Generar PDF
    const pdfBytes = await pdfDoc.save();
    const pdfBuffer = Buffer.from(pdfBytes);
    
    logInfo(`✅ [${orderId}] PDF generado exitosamente con pdf-lib: ${pdfBuffer.length} bytes`);
    return pdfBuffer;
    
  } catch (error) {
    logError(`❌ [${orderId}] Error generando PDF con pdf-lib:`, {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Build Order PDF with detailed or simplified customer info
 */
/*
export async function buildOrderPdf({ order, customer /* ...others */ /*}) {
  // TODO: Implementar si se necesita. Por ahora, usar generateReceiptPDF.
}
*/