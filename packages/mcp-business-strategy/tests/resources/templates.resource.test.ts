import { templatesResourceProvider } from '../../src/resources/templates.resource.js';
import { listTemplates, readTemplate } from '../../src/util/fs.js';

// Mock the fs utility
jest.mock('../../src/util/fs.js', () => ({
  listTemplates: jest.fn(),
  readTemplate: jest.fn(),
}));

const mockListTemplates = listTemplates as jest.MockedFunction<typeof listTemplates>;
const mockReadTemplate = readTemplate as jest.MockedFunction<typeof readTemplate>;

describe('Templates Resource Provider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Resource Listing', () => {
    it('should list available templates as resources', async () => {
      const mockTemplateNames = ['business-plan', 'market-analysis', 'financial-model'];
      mockListTemplates.mockResolvedValue(mockTemplateNames);

      const resources = await templatesResourceProvider.list();

      expect(mockListTemplates).toHaveBeenCalledTimes(1);
      expect(resources).toHaveLength(3);
      
      expect(resources[0]).toEqual({
        uri: 'templates://business-plan',
        name: '@templates:business-plan',
        description: 'Template business-plan for the workflow.',
        mimeType: 'text/markdown'
      });
      
      expect(resources[1]).toEqual({
        uri: 'templates://market-analysis',
        name: '@templates:market-analysis',
        description: 'Template market-analysis for the workflow.',
        mimeType: 'text/markdown'
      });
      
      expect(resources[2]).toEqual({
        uri: 'templates://financial-model',
        name: '@templates:financial-model',
        description: 'Template financial-model for the workflow.',
        mimeType: 'text/markdown'
      });
    });

    it('should handle empty template list', async () => {
      mockListTemplates.mockResolvedValue([]);

      const resources = await templatesResourceProvider.list();

      expect(resources).toHaveLength(0);
      expect(Array.isArray(resources)).toBe(true);
    });

    it('should handle single template', async () => {
      const mockTemplateNames = ['single-template'];
      mockListTemplates.mockResolvedValue(mockTemplateNames);

      const resources = await templatesResourceProvider.list();

      expect(resources).toHaveLength(1);
      expect(resources[0].uri).toBe('templates://single-template');
      expect(resources[0].name).toBe('@templates:single-template');
    });

    it('should handle template names with special characters', async () => {
      const mockTemplateNames = ['template-with-special-chars_123', 'template.with.dots'];
      mockListTemplates.mockResolvedValue(mockTemplateNames);

      const resources = await templatesResourceProvider.list();

      expect(resources).toHaveLength(2);
      expect(resources[0].uri).toBe('templates://template-with-special-chars_123');
      expect(resources[1].uri).toBe('templates://template.with.dots');
    });

    it('should handle listTemplates errors', async () => {
      mockListTemplates.mockRejectedValue(new Error('Directory not found'));

      await expect(templatesResourceProvider.list()).rejects.toThrow('Directory not found');
    });
  });

  describe('Resource Reading', () => {
    it('should read template content by URI', async () => {
      const uri = 'templates://business-plan';
      const mockContent = '# Business Plan Template\n\n## Executive Summary\n\nYour business plan content here.';
      mockReadTemplate.mockResolvedValue(mockContent);

      const result = await templatesResourceProvider.read({ uri });

      expect(mockReadTemplate).toHaveBeenCalledWith('business-plan');
      expect(result).toEqual({
        contents: [{
          uri,
          mimeType: 'text/markdown',
          text: mockContent
        }]
      });
    });

    it('should handle different template URIs', async () => {
      const uri = 'templates://market-analysis';
      const mockContent = '# Market Analysis Template\n\n## Market Size\n\nMarket analysis content.';
      mockReadTemplate.mockResolvedValue(mockContent);

      const result = await templatesResourceProvider.read({ uri });

      expect(mockReadTemplate).toHaveBeenCalledWith('market-analysis');
      expect(result.contents[0].uri).toBe(uri);
      expect(result.contents[0].text).toBe(mockContent);
    });

    it('should handle template names with special characters in URI', async () => {
      const uri = 'templates://template-with-special-chars_123';
      const mockContent = '# Special Template\n\nContent with special characters.';
      mockReadTemplate.mockResolvedValue(mockContent);

      const result = await templatesResourceProvider.read({ uri });

      expect(mockReadTemplate).toHaveBeenCalledWith('template-with-special-chars_123');
      expect(result.contents[0].uri).toBe(uri);
      expect(result.contents[0].text).toBe(mockContent);
    });

    it('should handle empty template content', async () => {
      const uri = 'templates://empty-template';
      const mockContent = '';
      mockReadTemplate.mockResolvedValue(mockContent);

      const result = await templatesResourceProvider.read({ uri });

      expect(result.contents[0].text).toBe('');
      expect(result.contents[0].mimeType).toBe('text/markdown');
    });

    it('should handle large template content', async () => {
      const uri = 'templates://large-template';
      const mockContent = '# Large Template\n\n' + 'Content line\n'.repeat(1000);
      mockReadTemplate.mockResolvedValue(mockContent);

      const result = await templatesResourceProvider.read({ uri });

      expect(result.contents[0].text).toBe(mockContent);
      expect((result.contents[0] as { text: string }).text.length).toBeGreaterThan(10000);
    });

    it('should handle readTemplate errors', async () => {
      const uri = 'templates://nonexistent-template';
      mockReadTemplate.mockRejectedValue(new Error('File not found'));

      await expect(templatesResourceProvider.read({ uri })).rejects.toThrow('File not found');
    });

    it('should handle permission errors', async () => {
      const uri = 'templates://restricted-template';
      mockReadTemplate.mockRejectedValue(new Error('Permission denied'));

      await expect(templatesResourceProvider.read({ uri })).rejects.toThrow('Permission denied');
    });
  });

  describe('URI Parsing', () => {
    it('should correctly parse template URI', async () => {
      const uri = 'templates://test-template';
      const mockContent = 'Test content';
      mockReadTemplate.mockResolvedValue(mockContent);

      await templatesResourceProvider.read({ uri });

      expect(mockReadTemplate).toHaveBeenCalledWith('test-template');
    });

    it('should handle URIs with complex template names', async () => {
      const uri = 'templates://complex-template-name-with-multiple-parts';
      const mockContent = 'Complex template content';
      mockReadTemplate.mockResolvedValue(mockContent);

      await templatesResourceProvider.read({ uri });

      expect(mockReadTemplate).toHaveBeenCalledWith('complex-template-name-with-multiple-parts');
    });

    it('should handle URIs with dots and underscores', async () => {
      const uri = 'templates://template.with.dots_and_underscores';
      const mockContent = 'Template with special chars';
      mockReadTemplate.mockResolvedValue(mockContent);

      await templatesResourceProvider.read({ uri });

      expect(mockReadTemplate).toHaveBeenCalledWith('template.with.dots_and_underscores');
    });
  });

  describe('Content Format', () => {
    it('should return content with correct MIME type', async () => {
      const uri = 'templates://test-template';
      const mockContent = '# Test Template\n\nContent here.';
      mockReadTemplate.mockResolvedValue(mockContent);

      const result = await templatesResourceProvider.read({ uri });

      expect(result.contents[0].mimeType).toBe('text/markdown');
    });

    it('should preserve markdown formatting', async () => {
      const uri = 'templates://markdown-template';
      const mockContent = '# Header\n\n**Bold text**\n\n*Italic text*\n\n- List item 1\n- List item 2';
      mockReadTemplate.mockResolvedValue(mockContent);

      const result = await templatesResourceProvider.read({ uri });

      expect(result.contents[0].text).toBe(mockContent);
      expect(result.contents[0].text).toContain('# Header');
      expect(result.contents[0].text).toContain('**Bold text**');
      expect(result.contents[0].text).toContain('*Italic text*');
    });

    it('should preserve code blocks', async () => {
      const uri = 'templates://code-template';
      const mockContent = '# Code Template\n\n```javascript\nconst example = "code";\nconsole.log(example);\n```';
      mockReadTemplate.mockResolvedValue(mockContent);

      const result = await templatesResourceProvider.read({ uri });

      expect(result.contents[0].text).toBe(mockContent);
      expect(result.contents[0].text).toContain('```javascript');
      expect(result.contents[0].text).toContain('const example = "code";');
    });
  });

  describe('Resource Structure', () => {
    it('should return properly structured resource list', async () => {
      const mockTemplateNames = ['template1', 'template2'];
      mockListTemplates.mockResolvedValue(mockTemplateNames);

      const resources = await templatesResourceProvider.list();

      expect(Array.isArray(resources)).toBe(true);
      resources.forEach(resource => {
        expect(resource).toHaveProperty('uri');
        expect(resource).toHaveProperty('name');
        expect(resource).toHaveProperty('description');
        expect(resource).toHaveProperty('mimeType');
        
        expect(typeof resource.uri).toBe('string');
        expect(typeof resource.name).toBe('string');
        expect(typeof resource.description).toBe('string');
        expect(typeof resource.mimeType).toBe('string');
        
        expect(resource.uri).toMatch(/^templates:\/\//);
        expect(resource.name).toMatch(/^@templates:/);
        expect(resource.mimeType).toBe('text/markdown');
      });
    });

    it('should return properly structured read result', async () => {
      const uri = 'templates://test-template';
      const mockContent = 'Test content';
      mockReadTemplate.mockResolvedValue(mockContent);

      const result = await templatesResourceProvider.read({ uri });

      expect(result).toHaveProperty('contents');
      expect(Array.isArray(result.contents)).toBe(true);
      expect(result.contents).toHaveLength(1);
      
      const content = result.contents[0];
      expect(content).toHaveProperty('uri');
      expect(content).toHaveProperty('mimeType');
      expect(content).toHaveProperty('text');
      
      expect(typeof content.uri).toBe('string');
      expect(typeof content.mimeType).toBe('string');
      expect(typeof content.text).toBe('string');
      
      expect(content.uri).toBe(uri);
      expect(content.mimeType).toBe('text/markdown');
      expect(content.text).toBe(mockContent);
    });
  });

  describe('Error Handling', () => {
    it('should propagate listTemplates errors', async () => {
      mockListTemplates.mockRejectedValue(new Error('File system error'));

      await expect(templatesResourceProvider.list()).rejects.toThrow('File system error');
    });

    it('should propagate readTemplate errors', async () => {
      const uri = 'templates://error-template';
      mockReadTemplate.mockRejectedValue(new Error('Read error'));

      await expect(templatesResourceProvider.read({ uri })).rejects.toThrow('Read error');
    });

    it('should handle network timeouts', async () => {
      const uri = 'templates://timeout-template';
      mockReadTemplate.mockRejectedValue(new Error('Network timeout'));

      await expect(templatesResourceProvider.read({ uri })).rejects.toThrow('Network timeout');
    });
  });
});
