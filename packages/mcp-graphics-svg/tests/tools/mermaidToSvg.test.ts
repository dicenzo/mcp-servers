import { mermaidToSvgTool, executeMermaidToSvg, wireframeToMermaid } from '../../src/tools/mermaidToSvg';

describe('mermaidToSvg Tool', () => {
  describe('mermaidToSvgTool', () => {
    it('should have correct tool metadata', () => {
      expect(mermaidToSvgTool.name).toBe('mermaid.to.svg');
      expect(mermaidToSvgTool.description).toContain('Convert Mermaid diagram code');
      expect(mermaidToSvgTool.inputSchema).toBeDefined();
    });

    it('should have valid input schema', () => {
      const schema = mermaidToSvgTool.inputSchema;
      expect(schema.type).toBe('object');
      expect(schema.properties).toHaveProperty('mermaid_code');
      expect(schema.properties).toHaveProperty('theme');
      expect(schema.properties).toHaveProperty('width');
      expect(schema.properties).toHaveProperty('height');
      expect(schema.properties).toHaveProperty('background');
      expect(schema.properties).toHaveProperty('config');
      expect(schema.required).toContain('mermaid_code');
    });

    it('should invoke with simple flowchart', async () => {
      const args = {
        mermaid_code: 'flowchart TD\n  A[Start] --> B[End]'
      };

      const result = await mermaidToSvgTool.invoke(args);
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content.length).toBeGreaterThan(0);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('<svg');
    });

    it('should handle different themes', async () => {
      const themes = ['default', 'forest', 'dark', 'neutral', 'base'] as const;
      
      for (const theme of themes) {
        const args = {
          mermaid_code: 'flowchart TD\n  A[Start] --> B[End]',
          theme
        };

        const result = await mermaidToSvgTool.invoke(args);
        expect(result).toBeDefined();
        expect(result.content[0].text).toContain('<svg');
      }
    });

    it('should handle custom dimensions', async () => {
      const args = {
        mermaid_code: 'flowchart TD\n  A[Start] --> B[End]',
        width: 600,
        height: 400
      };

      const result = await mermaidToSvgTool.invoke(args);
      expect(result.content[0].text).toContain('width="600"');
      expect(result.content[0].text).toContain('height="400"');
    });

    it('should handle background color', async () => {
      const args = {
        mermaid_code: 'flowchart TD\n  A[Start] --> B[End]',
        background: '#f0f0f0'
      };

      const result = await mermaidToSvgTool.invoke(args);
      expect(result).toBeDefined();
    });

    it('should handle flowchart config', async () => {
      const args = {
        mermaid_code: 'flowchart TD\n  A[Start] --> B[End]',
        config: {
          flowchart: {
            useMaxWidth: false,
            htmlLabels: true
          }
        }
      };

      const result = await mermaidToSvgTool.invoke(args);
      expect(result).toBeDefined();
    });

    it('should handle sequence diagram', async () => {
      const args = {
        mermaid_code: 'sequenceDiagram\n  Alice->>Bob: Hello Bob, how are you?\n  Bob-->>John: How about you John?\n  Bob--x Alice: I am good thanks!',
        config: {
          sequence: {
            useMaxWidth: true,
            wrap: true
          }
        }
      };

      const result = await mermaidToSvgTool.invoke(args);
      expect(result).toBeDefined();
    });

    it('should handle journey diagram', async () => {
      const args = {
        mermaid_code: 'journey\n  title My working day\n  section Go to work\n    Make tea: 5: Me\n    Go upstairs: 3: Me',
        config: {
          journey: {
            useMaxWidth: false
          }
        }
      };

      const result = await mermaidToSvgTool.invoke(args);
      expect(result).toBeDefined();
    });

    it('should throw error for invalid mermaid code', async () => {
      const args = {
        mermaid_code: 'invalid mermaid syntax here'
      };

      await expect(mermaidToSvgTool.invoke(args)).rejects.toThrow();
    });

    it('should throw error for invalid arguments', async () => {
      const invalidArgs = {
        mermaid_code: 123 // Should be string
      };

      await expect(mermaidToSvgTool.invoke(invalidArgs)).rejects.toThrow();
    });

    it('should throw error for missing required field', async () => {
      const invalidArgs = {
        theme: 'default' // Missing required mermaid_code
      };

      await expect(mermaidToSvgTool.invoke(invalidArgs)).rejects.toThrow();
    });
  });

  describe('executeMermaidToSvg', () => {
    it('should render simple flowchart', async () => {
      const args = {
        mermaid_code: 'flowchart TD\n  A[Start] --> B[End]',
        theme: 'default' as const
      };

      const result = await executeMermaidToSvg(args);
      expect(result).toContain('<svg');
      expect(result).toContain('xmlns="http://www.w3.org/2000/svg"');
    });

    it('should apply custom width and height', async () => {
      const args = {
        mermaid_code: 'flowchart TD\n  A[Start] --> B[End]',
        theme: 'default' as const,
        width: 800,
        height: 600
      };

      const result = await executeMermaidToSvg(args);
      expect(result).toContain('width="800"');
      expect(result).toContain('height="600"');
    });

    it('should handle forest theme', async () => {
      const args = {
        mermaid_code: 'flowchart TD\n  A[Start] --> B[End]',
        theme: 'forest' as const
      };

      const result = await executeMermaidToSvg(args);
      expect(result).toContain('<svg');
    });

    it('should handle dark theme', async () => {
      const args = {
        mermaid_code: 'flowchart TD\n  A[Start] --> B[End]',
        theme: 'dark' as const
      };

      const result = await executeMermaidToSvg(args);
      expect(result).toContain('<svg');
    });

    it('should handle custom background', async () => {
      const args = {
        mermaid_code: 'flowchart TD\n  A[Start] --> B[End]',
        theme: 'default' as const,
        background: '#ffffff'
      };

      const result = await executeMermaidToSvg(args);
      expect(result).toContain('<svg');
    });

    it('should handle flowchart configuration', async () => {
      const args = {
        mermaid_code: 'flowchart TD\n  A[Start] --> B[End]',
        theme: 'default' as const,
        config: {
          flowchart: {
            useMaxWidth: false,
            htmlLabels: true
          }
        }
      };

      const result = await executeMermaidToSvg(args);
      expect(result).toContain('<svg');
    });

    it('should handle sequence configuration', async () => {
      const args = {
        mermaid_code: 'sequenceDiagram\n  A->>B: Hello',
        theme: 'default' as const,
        config: {
          sequence: {
            useMaxWidth: false,
            wrap: true
          }
        }
      };

      const result = await executeMermaidToSvg(args);
      expect(result).toContain('<svg');
    });

    it('should handle journey configuration', async () => {
      const args = {
        mermaid_code: 'journey\n  title Test\n  section Work\n    Task: 5: Me',
        theme: 'default' as const,
        config: {
          journey: {
            useMaxWidth: false
          }
        }
      };

      const result = await executeMermaidToSvg(args);
      expect(result).toContain('<svg');
    });

    it('should throw error for malformed mermaid code', async () => {
      const args = {
        mermaid_code: 'this is not valid mermaid code at all',
        theme: 'default' as const
      };

      await expect(executeMermaidToSvg(args)).rejects.toThrow(/Mermaid rendering failed/);
    });
  });

  describe('wireframeToMermaid', () => {
    it('should convert simple wireframe to mermaid', () => {
      const wireframe = `### Header
[Button 1]
[Button 2]
### Footer`;

      const result = wireframeToMermaid(wireframe);
      expect(result).toContain('flowchart TD');
      expect(result).toContain('Button_1["Button 1"]');
      expect(result).toContain('Button_2["Button 2"]');
      expect(result).toContain('Header["Header"]');
      expect(result).toContain('Footer["Footer"]');
    });

    it('should handle empty wireframe', () => {
      const result = wireframeToMermaid('');
      expect(result).toBe('flowchart TD\n');
    });

    it('should handle wireframe with only sections', () => {
      const wireframe = `### Navigation
### Main Content
### Sidebar`;

      const result = wireframeToMermaid(wireframe);
      expect(result).toContain('Navigation["Navigation"]');
      expect(result).toContain('Main_Content["Main Content"]');
      expect(result).toContain('Sidebar["Sidebar"]');
      expect(result).toContain('Navigation --> Main_Content');
      expect(result).toContain('Main_Content --> Sidebar');
    });

    it('should handle wireframe with only buttons', () => {
      const wireframe = `[Submit Form]
[Cancel]
[Reset]`;

      const result = wireframeToMermaid(wireframe);
      expect(result).toContain('Submit_Form["Submit Form"]');
      expect(result).toContain('Cancel["Cancel"]');
      expect(result).toContain('Reset["Reset"]');
    });

    it('should handle wireframe with mixed content', () => {
      const wireframe = `### Header Section
[Login Button]
Some text content
[Register Link]
### Footer Section`;

      const result = wireframeToMermaid(wireframe);
      expect(result).toContain('Header_Section["Header Section"]');
      expect(result).toContain('Login_Button["Login Button"]');
      expect(result).toContain('Register_Link["Register Link"]');
      expect(result).toContain('Footer_Section["Footer Section"]');
    });

    it('should handle multiple buttons on same line', () => {
      const wireframe = `[Save] [Cancel] [Help]`;

      const result = wireframeToMermaid(wireframe);
      expect(result).toContain('Save["Save"]');
      expect(result).toContain('Cancel["Cancel"]');
      expect(result).toContain('Help["Help"]');
    });

    it('should handle special characters in section names', () => {
      const wireframe = `### User Profile & Settings
### Contact Info`;

      const result = wireframeToMermaid(wireframe);
      expect(result).toContain('User_Profile_&_Settings["User Profile & Settings"]');
      expect(result).toContain('Contact_Info["Contact Info"]');
    });
  });
});