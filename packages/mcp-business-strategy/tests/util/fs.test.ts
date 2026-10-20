import { promises as fs } from 'fs';
import path from 'path';
import { listTemplates, readTemplate } from '../../src/util/fs.js';

// Mock fs module
jest.mock('fs', () => ({
  promises: {
    readdir: jest.fn(),
    readFile: jest.fn(),
  },
}));

const mockFs = fs as jest.Mocked<typeof fs>;

describe('File System Utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('listTemplates', () => {
    it('should return template names without .md extension', async () => {
      const mockFiles = ['template1.md', 'template2.md', 'readme.txt', 'config.json'];
      mockFs.readdir.mockResolvedValue(mockFiles as any);

      const result = await listTemplates();

      expect(result).toEqual(['template1', 'template2']);
      expect(mockFs.readdir).toHaveBeenCalledWith(
        path.resolve(process.cwd(), '..', 'templates')
      );
    });

    it('should return empty array when no .md files exist', async () => {
      const mockFiles = ['readme.txt', 'config.json'];
      mockFs.readdir.mockResolvedValue(mockFiles as any);

      const result = await listTemplates();

      expect(result).toEqual([]);
    });

    it('should handle empty directory', async () => {
      mockFs.readdir.mockResolvedValue([]);

      const result = await listTemplates();

      expect(result).toEqual([]);
    });

    it('should handle readdir errors', async () => {
      mockFs.readdir.mockRejectedValue(new Error('Directory not found'));

      await expect(listTemplates()).rejects.toThrow('Directory not found');
    });
  });

  describe('readTemplate', () => {
    it('should read template file content', async () => {
      const mockContent = '# Test Template\n\nThis is a test template.';
      const templateName = 'test-template';
      const expectedPath = path.join(path.resolve(process.cwd(), '..', 'templates'), `${templateName}.md`);
      
      mockFs.readFile.mockResolvedValue(mockContent);

      const result = await readTemplate(templateName);

      expect(result).toBe(mockContent);
      expect(mockFs.readFile).toHaveBeenCalledWith(expectedPath, 'utf8');
    });

    it('should handle file read errors', async () => {
      const templateName = 'nonexistent-template';
      mockFs.readFile.mockRejectedValue(new Error('File not found'));

      await expect(readTemplate(templateName)).rejects.toThrow('File not found');
    });

    it('should handle special characters in template name', async () => {
      const templateName = 'template-with-special-chars_123';
      const mockContent = 'Template content';
      mockFs.readFile.mockResolvedValue(mockContent);

      const result = await readTemplate(templateName);

      expect(result).toBe(mockContent);
    });
  });
});
