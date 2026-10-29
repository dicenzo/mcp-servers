import sharp from 'sharp';
import puppeteer, { Browser, PDFOptions } from 'puppeteer';
import {
  ExportFormat,
  ExportOptions,
  ExportResult,
  RenderedTemplate,
  TemplateError,
  TemplateErrorCode
} from '../types/template.js';
import { timeOperation } from './performance.js';

/**
 * Export utilities for converting templates to various formats
 */
export class TemplateExporter {
  private static browserInstance: Browser | null = null;
  
  /**
   * Export rendered template to specified format
   */
  static async exportTemplate(
    renderedTemplate: RenderedTemplate,
    options: ExportOptions
  ): Promise<ExportResult> {
    return timeOperation(
      'template.export',
      () => this.performExport(renderedTemplate, options),
      { format: options.format }
    );
  }
  
  private static async performExport(
    renderedTemplate: RenderedTemplate,
    options: ExportOptions
  ): Promise<ExportResult> {
    const startTime = Date.now();
    
    try {
      switch (options.format) {
        case ExportFormat.SVG:
          return await this.exportSVG(renderedTemplate, options, startTime);
        case ExportFormat.PNG:
          return await this.exportPNG(renderedTemplate, options, startTime);
        case ExportFormat.JPEG:
          return await this.exportJPEG(renderedTemplate, options, startTime);
        case ExportFormat.WEBP:
          return await this.exportWebP(renderedTemplate, options, startTime);
        case ExportFormat.PDF:
          return await this.exportPDF(renderedTemplate, options, startTime);
        case ExportFormat.HTML:
          return await this.exportHTML(renderedTemplate, options, startTime);
        default:
          throw new Error(`Unsupported export format: ${options.format}`);
      }
    } catch (error) {
      return {
        success: false,
        format: options.format,
        size: { width: 0, height: 0, bytes: 0 },
        metadata: {
          exportTime: Date.now() - startTime,
          templateId: renderedTemplate.templateId,
          options
        },
        error: error instanceof Error ? error.message : 'Unknown export error'
      };
    }
  }
  
  /**
   * Export as SVG (direct output)
   */
  private static async exportSVG(
    renderedTemplate: RenderedTemplate,
    options: ExportOptions,
    startTime: number
  ): Promise<ExportResult> {
    const svgContent = renderedTemplate.content.svg;
    if (!svgContent) {
      throw new Error('No SVG content available in rendered template');
    }
    
    let processedSVG = svgContent;
    
    // Apply scaling if specified
    if (options.scale && options.scale !== 1) {
      const originalWidth = renderedTemplate.content.metadata.width;
      const originalHeight = renderedTemplate.content.metadata.height;
      const newWidth = originalWidth * options.scale;
      const newHeight = originalHeight * options.scale;
      
      processedSVG = svgContent.replace(
        /width="\d+" height="\d+"/,
        `width="${newWidth}" height="${newHeight}"`
      );
    }
    
    // Apply custom dimensions if specified
    if (options.width || options.height) {
      const width = options.width || renderedTemplate.content.metadata.width;
      const height = options.height || renderedTemplate.content.metadata.height;
      
      processedSVG = svgContent.replace(
        /width="\d+" height="\d+"/,
        `width="${width}" height="${height}"`
      );
    }
    
    const data = Buffer.from(processedSVG, 'utf8').toString('base64');
    
    return {
      success: true,
      data,
      format: ExportFormat.SVG,
      size: {
        width: options.width || renderedTemplate.content.metadata.width * (options.scale || 1),
        height: options.height || renderedTemplate.content.metadata.height * (options.scale || 1),
        bytes: Buffer.from(processedSVG, 'utf8').length
      },
      metadata: {
        exportTime: Date.now() - startTime,
        templateId: renderedTemplate.templateId,
        options
      }
    };
  }
  
  /**
   * Export as PNG using Sharp
   */
  private static async exportPNG(
    renderedTemplate: RenderedTemplate,
    options: ExportOptions,
    startTime: number
  ): Promise<ExportResult> {
    const svgContent = renderedTemplate.content.svg;
    if (!svgContent) {
      throw new Error('No SVG content available for PNG export');
    }
    
    const width = options.width || renderedTemplate.content.metadata.width;
    const height = options.height || renderedTemplate.content.metadata.height;
    const scale = options.scale || 1;
    
    let sharpInstance = sharp(Buffer.from(svgContent));
    
    // Resize if needed
    if (width !== renderedTemplate.content.metadata.width || height !== renderedTemplate.content.metadata.height) {
      sharpInstance = sharpInstance.resize(Math.round(width * scale), Math.round(height * scale));
    }
    
    // Add background if specified
    if (options.background) {
      sharpInstance = sharpInstance.flatten({ background: options.background });
    }
    
    const buffer = await sharpInstance.png().toBuffer();
    const data = buffer.toString('base64');
    
    return {
      success: true,
      data,
      format: ExportFormat.PNG,
      size: {
        width: Math.round(width * scale),
        height: Math.round(height * scale),
        bytes: buffer.length
      },
      metadata: {
        exportTime: Date.now() - startTime,
        templateId: renderedTemplate.templateId,
        options
      }
    };
  }
  
  /**
   * Export as JPEG using Sharp
   */
  private static async exportJPEG(
    renderedTemplate: RenderedTemplate,
    options: ExportOptions,
    startTime: number
  ): Promise<ExportResult> {
    const svgContent = renderedTemplate.content.svg;
    if (!svgContent) {
      throw new Error('No SVG content available for JPEG export');
    }
    
    const width = options.width || renderedTemplate.content.metadata.width;
    const height = options.height || renderedTemplate.content.metadata.height;
    const scale = options.scale || 1;
    const quality = options.quality || 80;
    
    let sharpInstance = sharp(Buffer.from(svgContent));
    
    // Resize if needed
    if (width !== renderedTemplate.content.metadata.width || height !== renderedTemplate.content.metadata.height) {
      sharpInstance = sharpInstance.resize(Math.round(width * scale), Math.round(height * scale));
    }
    
    // JPEG requires background (no transparency)
    const background = options.background || '#ffffff';
    sharpInstance = sharpInstance.flatten({ background });
    
    const buffer = await sharpInstance.jpeg({ quality }).toBuffer();
    const data = buffer.toString('base64');
    
    return {
      success: true,
      data,
      format: ExportFormat.JPEG,
      size: {
        width: Math.round(width * scale),
        height: Math.round(height * scale),
        bytes: buffer.length
      },
      metadata: {
        exportTime: Date.now() - startTime,
        templateId: renderedTemplate.templateId,
        options
      }
    };
  }
  
  /**
   * Export as WebP using Sharp
   */
  private static async exportWebP(
    renderedTemplate: RenderedTemplate,
    options: ExportOptions,
    startTime: number
  ): Promise<ExportResult> {
    const svgContent = renderedTemplate.content.svg;
    if (!svgContent) {
      throw new Error('No SVG content available for WebP export');
    }
    
    const width = options.width || renderedTemplate.content.metadata.width;
    const height = options.height || renderedTemplate.content.metadata.height;
    const scale = options.scale || 1;
    const quality = options.quality || 80;
    
    let sharpInstance = sharp(Buffer.from(svgContent));
    
    // Resize if needed
    if (width !== renderedTemplate.content.metadata.width || height !== renderedTemplate.content.metadata.height) {
      sharpInstance = sharpInstance.resize(Math.round(width * scale), Math.round(height * scale));
    }
    
    // Add background if specified
    if (options.background) {
      sharpInstance = sharpInstance.flatten({ background: options.background });
    }
    
    const buffer = await sharpInstance.webp({ quality }).toBuffer();
    const data = buffer.toString('base64');
    
    return {
      success: true,
      data,
      format: ExportFormat.WEBP,
      size: {
        width: Math.round(width * scale),
        height: Math.round(height * scale),
        bytes: buffer.length
      },
      metadata: {
        exportTime: Date.now() - startTime,
        templateId: renderedTemplate.templateId,
        options
      }
    };
  }
  
  /**
   * Export as PDF using Puppeteer
   */
  private static async exportPDF(
    renderedTemplate: RenderedTemplate,
    options: ExportOptions,
    startTime: number
  ): Promise<ExportResult> {
    const htmlContent = renderedTemplate.content.html;
    if (!htmlContent) {
      throw new Error('No HTML content available for PDF export');
    }
    
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    
    try {
      // Template HTML can carry caller-supplied content, so render it as a static
      // document: no scripts, and no network or file requests (inline data: URIs only).
      await page.setJavaScriptEnabled(false);
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        const url = request.url();
        if (url === 'about:blank' || url.startsWith('data:')) {
          request.continue();
        } else {
          request.abort('blockedbyclient');
        }
      });

      // Create complete HTML document
      const fullHTML = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { margin: 0; padding: 0; }
            * { box-sizing: border-box; }
          </style>
        </head>
        <body>
          ${htmlContent}
        </body>
        </html>
      `;
      
      await page.setContent(fullHTML);
      
      // Set viewport to match template dimensions
      const width = options.width || renderedTemplate.content.metadata.width;
      const height = options.height || renderedTemplate.content.metadata.height;
      
      await page.setViewport({ width, height });
      
      // Configure PDF options
      const pdfOptions: PDFOptions = {
        width,
        height,
        pageRanges: '1',
        printBackground: true
      };
      
      // Set page size if specified
      if (options.pageSize) {
        const pageSizes = {
          A4: { width: 8.27, height: 11.69 },
          A3: { width: 11.69, height: 16.54 },
          Letter: { width: 8.5, height: 11 },
          Legal: { width: 8.5, height: 14 }
        };
        
        const pageSize = pageSizes[options.pageSize];
        if (pageSize) {
          pdfOptions.format = options.pageSize;
          delete pdfOptions.width;
          delete pdfOptions.height;
        }
      }
      
      // Set margin if specified
      if (options.margin) {
        pdfOptions.margin = {
          top: options.margin,
          right: options.margin,
          bottom: options.margin,
          left: options.margin
        };
      }
      
      const buffer = await page.pdf(pdfOptions);
      const data = Buffer.from(buffer).toString('base64');
      
      return {
        success: true,
        data,
        format: ExportFormat.PDF,
        size: {
          width: width,
          height: height,
          bytes: buffer.length
        },
        metadata: {
          exportTime: Date.now() - startTime,
          templateId: renderedTemplate.templateId,
          options
        }
      };
      
    } finally {
      await page.close();
    }
  }
  
  /**
   * Export as HTML (direct output)
   */
  private static async exportHTML(
    renderedTemplate: RenderedTemplate,
    options: ExportOptions,
    startTime: number
  ): Promise<ExportResult> {
    const htmlContent = renderedTemplate.content.html;
    if (!htmlContent) {
      throw new Error('No HTML content available in rendered template');
    }
    
    // Create complete HTML document
    const fullHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Template Export</title>
        <style>
          body {
            margin: 0;
            padding: 0;
            font-family: Arial, sans-serif;
          }
          * {
            box-sizing: border-box;
          }
        </style>
      </head>
      <body>
        ${htmlContent}
      </body>
      </html>
    `;
    
    const data = Buffer.from(fullHTML, 'utf8').toString('base64');
    
    return {
      success: true,
      data,
      format: ExportFormat.HTML,
      size: {
        width: options.width || renderedTemplate.content.metadata.width,
        height: options.height || renderedTemplate.content.metadata.height,
        bytes: Buffer.from(fullHTML, 'utf8').length
      },
      metadata: {
        exportTime: Date.now() - startTime,
        templateId: renderedTemplate.templateId,
        options
      }
    };
  }
  
  /**
   * Get or create browser instance for PDF generation
   */
  private static async getBrowser(): Promise<Browser> {
    if (!this.browserInstance) {
      // Chromium's sandbox stays on by default. Set MCP_TEMPLATES_NO_SANDBOX=1 only in
      // environments that can't run it (some containers), ideally ones without network access.
      const noSandbox = process.env.MCP_TEMPLATES_NO_SANDBOX === '1';
      this.browserInstance = await puppeteer.launch({
        headless: true,
        args: [
          ...(noSandbox ? ['--no-sandbox', '--disable-setuid-sandbox', '--no-zygote'] : []),
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--disable-gpu'
        ]
      });
      
      // Handle browser disconnection
      this.browserInstance.on('disconnected', () => {
        this.browserInstance = null;
      });
    }
    
    return this.browserInstance;
  }
  
  /**
   * Close browser instance
   */
  static async closeBrowser(): Promise<void> {
    if (this.browserInstance) {
      await this.browserInstance.close();
      this.browserInstance = null;
    }
  }
  
  /**
   * Get supported export formats
   */
  static getSupportedFormats(): ExportFormat[] {
    return Object.values(ExportFormat);
  }
  
  /**
   * Validate export options
   */
  static validateExportOptions(options: ExportOptions): TemplateError[] {
    const errors: TemplateError[] = [];
    
    // Validate format
    if (!Object.values(ExportFormat).includes(options.format)) {
      errors.push({
        code: TemplateErrorCode.EXPORT_ERROR,
        message: `Unsupported export format: ${options.format}`,
        suggestions: [`Use one of: ${Object.values(ExportFormat).join(', ')}`]
      });
    }
    
    // Validate quality for applicable formats
    if (options.quality !== undefined) {
      if (![ExportFormat.JPEG, ExportFormat.WEBP].includes(options.format)) {
        errors.push({
          code: TemplateErrorCode.EXPORT_ERROR,
          message: `Quality option not supported for ${options.format} format`,
          suggestions: ['Quality is only supported for JPEG and WebP formats']
        });
      } else if (options.quality < 0 || options.quality > 100) {
        errors.push({
          code: TemplateErrorCode.EXPORT_ERROR,
          message: 'Quality must be between 0 and 100',
          suggestions: ['Set quality to a value between 0 and 100']
        });
      }
    }
    
    // Validate dimensions
    if (options.width !== undefined && options.width <= 0) {
      errors.push({
        code: TemplateErrorCode.EXPORT_ERROR,
        message: 'Width must be positive',
        suggestions: ['Set width to a positive number']
      });
    }
    
    if (options.height !== undefined && options.height <= 0) {
      errors.push({
        code: TemplateErrorCode.EXPORT_ERROR,
        message: 'Height must be positive',
        suggestions: ['Set height to a positive number']
      });
    }
    
    // Validate scale
    if (options.scale !== undefined && (options.scale <= 0 || options.scale > 10)) {
      errors.push({
        code: TemplateErrorCode.EXPORT_ERROR,
        message: 'Scale must be between 0.1 and 10',
        suggestions: ['Set scale to a value between 0.1 and 10']
      });
    }
    
    // Validate PDF-specific options
    if (options.pageSize && options.format !== ExportFormat.PDF) {
      errors.push({
        code: TemplateErrorCode.EXPORT_ERROR,
        message: 'Page size option only available for PDF format',
        suggestions: ['Remove pageSize option or use PDF format']
      });
    }
    
    if (options.margin && options.format !== ExportFormat.PDF) {
      errors.push({
        code: TemplateErrorCode.EXPORT_ERROR,
        message: 'Margin option only available for PDF format',
        suggestions: ['Remove margin option or use PDF format']
      });
    }
    
    return errors;
  }
}
