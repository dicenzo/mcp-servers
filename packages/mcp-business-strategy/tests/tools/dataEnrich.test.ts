import 'jest';
import { dataEnrichTool } from '../../src/tools/dataEnrich';

// Type assertion to fix TypeScript inference issue with MCP SDK
const tool = dataEnrichTool as any;

describe('Data Enrich Tool', () => {
  describe('Tool Configuration', () => {
    it('should have correct tool configuration', () => {
      expect(dataEnrichTool.name).toBe('data.enrich');
      expect(dataEnrichTool.description).toContain('Enrich business topics');
      expect(dataEnrichTool.inputSchema).toBeDefined();
      expect(dataEnrichTool.inputSchema.required).toEqual(['topic']);
    });
  });

  describe('Input Validation', () => {
    // Tools throw on invalid input; src/index.ts turns the throw into the MCP error response
    // ({ error: true, message } with isError), which tests/index.test.ts covers.
    it('should validate required topic parameter', async () => {
      const generator = tool.invoke({} as any);

      await expect(generator.next()).rejects.toThrow(/Data enrichment failed: .*"topic"/s);
    });

    it('should validate topic is not empty', async () => {
      const generator = tool.invoke({ topic: '' });

      await expect(generator.next()).rejects.toThrow('Topic cannot be empty');
    });

    it('should accept valid topic', async () => {
      const generator = tool.invoke({ topic: 'AI market' });
      const result = await generator.next();
      
      expect(result.value).toBeDefined();
      expect(result.value.type).toBe('text');
      const response = JSON.parse(result.value.text);
      expect(response.topic).toBe('AI market');
    });
  });

  describe('AI Market Data Generation', () => {
    it('should generate AI market data for AI-related topics', async () => {
      const generator = tool.invoke({ topic: 'artificial intelligence' });
      const result = await generator.next();
      
      const response = JSON.parse(result.value.text);
      
      expect(response.topic).toBe('artificial intelligence');
      expect(response.tam).toBeGreaterThanOrEqual(100000000000); // >= $100B, the inclusive floor of the generated range
      expect(response.sam).toBeGreaterThan(0);
      expect(response.som).toBeGreaterThan(0);
      expect(response.growth_rate).toBeGreaterThanOrEqual(20);
      expect(response.growth_rate).toBeLessThanOrEqual(45);
      expect(response.key_metrics).toHaveLength(4);
      expect(response.market_segments).toContain('Generative AI Platforms');
      expect(response.competitive_landscape.market_leaders).toContain('OpenAI');
      expect(response.trends).toContain('Increasing enterprise adoption of generative AI');
      expect(response.data_quality).toBe('High');
      expect(response.last_updated).toBeDefined();
    });

    it('should generate AI data for machine learning topics', async () => {
      const generator = tool.invoke({ topic: 'machine learning platforms' });
      const result = await generator.next();
      
      const response = JSON.parse(result.value.text);
      expect(response.market_segments).toContain('MLOps and Model Management');
    });
  });

  describe('SaaS Market Data Generation', () => {
    it('should generate SaaS market data for software topics', async () => {
      const generator = tool.invoke({ topic: 'SaaS platforms' });
      const result = await generator.next();
      
      const response = JSON.parse(result.value.text);
      
      expect(response.topic).toBe('SaaS platforms');
      expect(response.tam).toBeGreaterThanOrEqual(200000000000); // >= $200B, the inclusive floor of the generated range
      expect(response.growth_rate).toBeGreaterThanOrEqual(10);
      expect(response.growth_rate).toBeLessThanOrEqual(25);
      expect(response.market_segments).toContain('Customer Relationship Management (CRM)');
      expect(response.competitive_landscape.market_leaders).toContain('Salesforce');
      expect(response.trends).toContain('Vertical SaaS solutions gaining market share');
    });

    it('should generate SaaS data for app/platform topics', async () => {
      const generator = tool.invoke({ topic: 'mobile app development' });
      const result = await generator.next();
      
      const response = JSON.parse(result.value.text);
      expect(response.market_segments).toContain('Collaboration and Productivity');
    });
  });

  describe('Healthcare Market Data Generation', () => {
    it('should generate healthcare market data for health topics', async () => {
      const generator = tool.invoke({ topic: 'healthcare technology' });
      const result = await generator.next();
      
      const response = JSON.parse(result.value.text);
      
      expect(response.topic).toBe('healthcare technology');
      expect(response.tam).toBeGreaterThanOrEqual(300000000000); // >= $300B, the inclusive floor of the generated range
      expect(response.growth_rate).toBeGreaterThanOrEqual(8);
      expect(response.growth_rate).toBeLessThanOrEqual(20);
      expect(response.market_segments).toContain('Electronic Health Records (EHR)');
      expect(response.competitive_landscape.market_leaders).toContain('Epic Systems');
      expect(response.regulatory_factors).toContain('HIPAA privacy and security requirements');
    });

    it('should generate healthcare data for medical/pharma topics', async () => {
      const generator = tool.invoke({ topic: 'pharmaceutical industry' });
      const result = await generator.next();
      
      const response = JSON.parse(result.value.text);
      expect(response.market_segments).toContain('Population Health Management');
    });
  });

  describe('Fintech Market Data Generation', () => {
    it('should generate fintech market data for financial topics', async () => {
      const generator = tool.invoke({ topic: 'fintech solutions' });
      const result = await generator.next();
      
      const response = JSON.parse(result.value.text);
      
      expect(response.topic).toBe('fintech solutions');
      expect(response.tam).toBeGreaterThanOrEqual(150000000000); // >= $150B, the inclusive floor of the generated range
      expect(response.growth_rate).toBeGreaterThanOrEqual(15);
      expect(response.growth_rate).toBeLessThanOrEqual(35);
      expect(response.market_segments).toContain('Digital Banking and Neobanks');
      expect(response.competitive_landscape.market_leaders).toContain('Stripe');
      expect(response.trends).toContain('Embedded finance integration across industries');
    });

    it('should generate fintech data for banking/payment topics', async () => {
      const generator = tool.invoke({ topic: 'digital payments' });
      const result = await generator.next();
      
      const response = JSON.parse(result.value.text);
      expect(response.market_segments).toContain('Payment Processing and Wallets');
    });
  });

  describe('E-commerce Market Data Generation', () => {
    it('should generate e-commerce market data for retail topics', async () => {
      const generator = tool.invoke({ topic: 'e-commerce platforms' });
      const result = await generator.next();
      
      const response = JSON.parse(result.value.text);
      
      expect(response.topic).toBe('e-commerce platforms');
      expect(response.tam).toBeGreaterThanOrEqual(400000000000); // >= $400B, the inclusive floor of the generated range
      expect(response.growth_rate).toBeGreaterThanOrEqual(12);
      expect(response.growth_rate).toBeLessThanOrEqual(30);
      expect(response.market_segments).toContain('B2C E-commerce Platforms');
      expect(response.competitive_landscape.market_leaders).toContain('Amazon');
      expect(response.trends).toContain('Headless commerce and API-first architectures');
    });

    it('should route retail topics to e-commerce, not AI', async () => {
      // "retail" contains the letters "ai"; a substring match used to send it to the AI branch
      const generator = tool.invoke({ topic: 'online retail' });
      const result = await generator.next();
      
      const response = JSON.parse(result.value.text);
      expect(response.market_segments).toContain('B2C E-commerce Platforms');
    });

    it('should generate e-commerce data for marketplace topics', async () => {
      const generator = tool.invoke({ topic: 'online marketplace' });
      const result = await generator.next();
      
      const response = JSON.parse(result.value.text);
      expect(response.market_segments).toContain('Marketplace Platforms');
    });
  });

  describe('Topic Routing', () => {
    it('should prefer the industry over generic platform/app wording', async () => {
      const generator = tool.invoke({ topic: 'healthcare app' });
      const result = await generator.next();
      
      const response = JSON.parse(result.value.text);
      expect(response.market_segments).toContain('Electronic Health Records (EHR)');
    });

    it('should not match short keywords inside other words', async () => {
      // "supply chain" contains "ai", "happy" contains "app"
      const generator = tool.invoke({ topic: 'happy supply chain' });
      const result = await generator.next();
      
      const response = JSON.parse(result.value.text);
      expect(response.data_quality).toBe('Estimated');
      expect(response.market_segments).toContain('Enterprise Solutions');
    });
  });

  describe('General Market Data Generation', () => {
    it('should generate general market data for unknown topics', async () => {
      const generator = tool.invoke({ topic: 'widget manufacturing' });
      const result = await generator.next();
      
      const response = JSON.parse(result.value.text);
      
      expect(response.topic).toBe('widget manufacturing');
      expect(response.tam).toBeGreaterThanOrEqual(50000000000); // >= $50B, the inclusive floor of the generated range
      expect(response.growth_rate).toBeGreaterThanOrEqual(5);
      expect(response.growth_rate).toBeLessThanOrEqual(20);
      expect(response.market_segments).toContain('Enterprise Solutions');
      expect(response.data_quality).toBe('Estimated');
      expect(response.notes).toContain('Market data estimated based on industry analysis');
    });
  });

  describe('Data Structure Validation', () => {
    it('should return properly structured market data', async () => {
      const generator = tool.invoke({ topic: 'test market' });
      const result = await generator.next();
      
      const response = JSON.parse(result.value.text);
      
      // Required fields
      expect(response).toHaveProperty('topic');
      expect(response).toHaveProperty('tam');
      expect(response).toHaveProperty('sam');
      expect(response).toHaveProperty('som');
      expect(response).toHaveProperty('growth_rate');
      expect(response).toHaveProperty('key_metrics');
      expect(response).toHaveProperty('market_segments');
      expect(response).toHaveProperty('competitive_landscape');
      expect(response).toHaveProperty('trends');
      expect(response).toHaveProperty('regulatory_factors');
      expect(response).toHaveProperty('notes');
      expect(response).toHaveProperty('data_quality');
      expect(response).toHaveProperty('last_updated');
      
      // Data types
      expect(typeof response.topic).toBe('string');
      expect(typeof response.tam).toBe('number');
      expect(typeof response.sam).toBe('number');
      expect(typeof response.som).toBe('number');
      expect(typeof response.growth_rate).toBe('number');
      expect(Array.isArray(response.key_metrics)).toBe(true);
      expect(Array.isArray(response.market_segments)).toBe(true);
      expect(Array.isArray(response.trends)).toBe(true);
      expect(Array.isArray(response.regulatory_factors)).toBe(true);
      expect(Array.isArray(response.notes)).toBe(true);
      
      // Competitive landscape structure
      expect(response.competitive_landscape).toHaveProperty('total_companies');
      expect(response.competitive_landscape).toHaveProperty('market_leaders');
      expect(response.competitive_landscape).toHaveProperty('market_concentration');
      expect(Array.isArray(response.competitive_landscape.market_leaders)).toBe(true);
    });

    it('should have realistic market size relationships', async () => {
      const generator = tool.invoke({ topic: 'test market' });
      const result = await generator.next();
      
      const response = JSON.parse(result.value.text);
      
      // TAM should be largest
      expect(response.tam).toBeGreaterThanOrEqual(response.sam);
      expect(response.sam).toBeGreaterThanOrEqual(response.som);
      
      // Growth rate should be positive
      expect(response.growth_rate).toBeGreaterThan(0);
      
      // Market concentration should be valid
      expect(['High', 'Medium', 'Low']).toContain(response.competitive_landscape.market_concentration);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid input gracefully', async () => {
      const generator = tool.invoke({ topic: null } as any);

      await expect(generator.next()).rejects.toThrow('Expected string, received null');
    });

    it('should handle very long topic names', async () => {
      const longTopic = 'a'.repeat(1000);
      const generator = tool.invoke({ topic: longTopic });
      const result = await generator.next();
      
      const response = JSON.parse(result.value.text);
      expect(response.topic).toBe(longTopic);
      expect(response.data_quality).toBe('Estimated');
    });
  });
});
