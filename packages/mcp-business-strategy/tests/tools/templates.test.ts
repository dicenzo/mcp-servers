import 'jest';
import { templatesTool } from '../../src/tools/templates.js';
import { readTemplate } from '../../src/util/fs.js';

// Type assertion to fix TypeScript inference issue with MCP SDK
const tool = templatesTool as any;

// Mock the fs utility
jest.mock('../../src/util/fs.js', () => ({
  readTemplate: jest.fn(),
}));

const mockReadTemplate = readTemplate as jest.MockedFunction<typeof readTemplate>;

describe('Templates Tool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Tool Configuration', () => {
    it('should have correct tool configuration', () => {
      expect(templatesTool.name).toBe('templates.get');
      expect(templatesTool.description).toContain('Return a template file content');
      expect(templatesTool.inputSchema).toBeDefined();
      expect(templatesTool.inputSchema.required).toEqual(['name']);
    });
  });

  describe('Input Validation', () => {
    // Tools throw on invalid input; src/index.ts turns the throw into the MCP error response
    // ({ error: true, message } with isError), which tests/index.test.ts covers.
    it('should validate required name parameter', async () => {
      const generator = tool.invoke({} as any);

      await expect(generator.next()).rejects.toThrow(/"name"[\s\S]*expected string, received undefined/);
      expect(mockReadTemplate).not.toHaveBeenCalled();
    });

    it('should validate name is a string', async () => {
      const generator = tool.invoke({ name: 123 } as any);

      await expect(generator.next()).rejects.toThrow('expected string, received number');
      expect(mockReadTemplate).not.toHaveBeenCalled();
    });

    it('should reject an overlong name', async () => {
      const generator = tool.invoke({ name: 'a'.repeat(101) });

      await expect(generator.next()).rejects.toThrow(/at most 100 character/);
      expect(mockReadTemplate).not.toHaveBeenCalled();
    });

    it('should accept valid name parameter', async () => {
      const mockContent = '# Test Template\n\nThis is a test template.';
      mockReadTemplate.mockResolvedValue(mockContent);

      const generator = tool.invoke({ name: 'test-template' });
      const result = await generator.next();
      
      expect(result.value).toBeDefined();
      expect(result.value.type).toBe('text');
      expect(result.value.text).toBe(mockContent);
    });
  });

  describe('Template Reading', () => {
    it('should read template content successfully', async () => {
      const templateName = 'business-plan';
      const mockContent = '# Business Plan Template\n\n## Executive Summary\n\nYour business plan content here.';
      mockReadTemplate.mockResolvedValue(mockContent);

      const generator = tool.invoke({ name: templateName });
      const result = await generator.next();
      
      expect(mockReadTemplate).toHaveBeenCalledWith(templateName);
      expect(result.value.text).toBe(mockContent);
    });

    it('should handle different template names', async () => {
      const templateName = 'market-analysis';
      const mockContent = '# Market Analysis Template\n\n## Market Size\n\nMarket analysis content.';
      mockReadTemplate.mockResolvedValue(mockContent);

      const generator = tool.invoke({ name: templateName });
      const result = await generator.next();
      
      expect(mockReadTemplate).toHaveBeenCalledWith(templateName);
      expect(result.value.text).toBe(mockContent);
    });

    it('should handle template names with special characters', async () => {
      const templateName = 'template-with-special-chars_123';
      const mockContent = '# Special Template\n\nContent with special characters.';
      mockReadTemplate.mockResolvedValue(mockContent);

      const generator = tool.invoke({ name: templateName });
      const result = await generator.next();
      
      expect(mockReadTemplate).toHaveBeenCalledWith(templateName);
      expect(result.value.text).toBe(mockContent);
    });

    it('should handle empty template content', async () => {
      const templateName = 'empty-template';
      const mockContent = '';
      mockReadTemplate.mockResolvedValue(mockContent);

      const generator = tool.invoke({ name: templateName });
      const result = await generator.next();
      
      expect(result.value.text).toBe('');
    });

    it('should handle large template content', async () => {
      const templateName = 'large-template';
      const mockContent = '# Large Template\n\n' + 'Content line\n'.repeat(1000);
      mockReadTemplate.mockResolvedValue(mockContent);

      const generator = tool.invoke({ name: templateName });
      const result = await generator.next();
      
      expect(result.value.text).toBe(mockContent);
    });
  });

  describe('Error Handling', () => {
    it('should handle file read errors', async () => {
      const templateName = 'nonexistent-template';
      mockReadTemplate.mockRejectedValue(new Error('File not found'));

      const generator = tool.invoke({ name: templateName });

      // The tool lets readTemplate's error propagate; index.ts reports it to the client
      await expect(generator.next()).rejects.toThrow('File not found');
      expect(mockReadTemplate).toHaveBeenCalledWith(templateName);
    });

    it('should handle permission errors', async () => {
      const templateName = 'restricted-template';
      mockReadTemplate.mockRejectedValue(new Error('Permission denied'));

      const generator = tool.invoke({ name: templateName });

      // The tool lets readTemplate's error propagate; index.ts reports it to the client
      await expect(generator.next()).rejects.toThrow('Permission denied');
      expect(mockReadTemplate).toHaveBeenCalledWith(templateName);
    });

    it('should handle network errors', async () => {
      const templateName = 'network-template';
      mockReadTemplate.mockRejectedValue(new Error('Network timeout'));

      const generator = tool.invoke({ name: templateName });

      // The tool lets readTemplate's error propagate; index.ts reports it to the client
      await expect(generator.next()).rejects.toThrow('Network timeout');
      expect(mockReadTemplate).toHaveBeenCalledWith(templateName);
    });
  });

  describe('Return Format', () => {
    it('should return text type content', async () => {
      const mockContent = '# Test Template\n\nContent here.';
      mockReadTemplate.mockResolvedValue(mockContent);

      const generator = tool.invoke({ name: 'test' });
      const result = await generator.next();
      
      expect(result.value.type).toBe('text');
      expect(typeof result.value.text).toBe('string');
    });

    it('should preserve markdown formatting', async () => {
      const mockContent = '# Header\n\n**Bold text**\n\n*Italic text*\n\n- List item 1\n- List item 2';
      mockReadTemplate.mockResolvedValue(mockContent);

      const generator = tool.invoke({ name: 'markdown-template' });
      const result = await generator.next();
      
      expect(result.value.text).toBe(mockContent);
      expect(result.value.text).toContain('# Header');
      expect(result.value.text).toContain('**Bold text**');
      expect(result.value.text).toContain('*Italic text*');
    });

    it('should preserve code blocks', async () => {
      const mockContent = '# Code Template\n\n```javascript\nconst example = "code";\nconsole.log(example);\n```';
      mockReadTemplate.mockResolvedValue(mockContent);

      const generator = tool.invoke({ name: 'code-template' });
      const result = await generator.next();
      
      expect(result.value.text).toBe(mockContent);
      expect(result.value.text).toContain('```javascript');
      expect(result.value.text).toContain('const example = "code";');
    });
  });

  describe('Integration with File System', () => {
    it('should call readTemplate with correct parameters', async () => {
      const templateName = 'integration-test';
      const mockContent = 'Integration test content';
      mockReadTemplate.mockResolvedValue(mockContent);

      const generator = tool.invoke({ name: templateName });
      await generator.next();
      
      expect(mockReadTemplate).toHaveBeenCalledTimes(1);
      expect(mockReadTemplate).toHaveBeenCalledWith(templateName);
    });

    it('should handle multiple calls with different templates', async () => {
      const template1 = 'template-1';
      const template2 = 'template-2';
      const content1 = 'Content 1';
      const content2 = 'Content 2';
      
      mockReadTemplate
        .mockResolvedValueOnce(content1)
        .mockResolvedValueOnce(content2);

      const generator1 = tool.invoke({ name: template1 });
      const result1 = await generator1.next();
      
      const generator2 = tool.invoke({ name: template2 });
      const result2 = await generator2.next();
      
      expect(mockReadTemplate).toHaveBeenCalledWith(template1);
      expect(mockReadTemplate).toHaveBeenCalledWith(template2);
      expect(result1.value.text).toBe(content1);
      expect(result2.value.text).toBe(content2);
    });
  });
});
