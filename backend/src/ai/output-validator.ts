
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  sanitized?: unknown;
}

export interface ValidationError {
  field: string;
  message: string;
  received: unknown;
}

export interface ValidationWarning {
  field: string;
  message: string;
}

export class OutputValidator {

  validateFindingExplanation(data: unknown): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    
    if (!this.isObject(data)) {
      return { valid: false, errors: [{ field: 'root', message: 'Expected object', received: typeof data }], warnings: [] };
    }

    const sanitized: Record<string, unknown> = { ...data };

    const checkStringField = (field: string, minLength: number, maxLength: number) => {
      if (!this.hasField(data, field, 'string') || (data[field] as string).trim().length === 0) {
        errors.push({ field, message: `Missing or empty string field: ${field}`, received: data[field] });
      } else {
        const val = (data[field] as string).trim();
        if (val.length < minLength) {
          errors.push({ field, message: `Field ${field} is too short (min ${minLength})`, received: val.length });
        } else if (val.length > maxLength) {
          warnings.push({ field, message: `Field ${field} is too long (max ${maxLength}), truncating` });
          sanitized[field] = val.substring(0, maxLength);
        } else {
          sanitized[field] = val;
        }
      }
    };

    checkStringField('ruleId', 1, 100);
    checkStringField('plainEnglishRisk', 10, 500);
    checkStringField('technicalDetail', 10, 500);
    checkStringField('failureScenario', 10, 500);
    checkStringField('businessImpact', 10, 500);

    if (!this.hasField(data, 'confidence', 'string') || !['high', 'medium', 'low'].includes(data.confidence as string)) {
      errors.push({ field: 'confidence', message: 'Must be high, medium, or low', received: data.confidence });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      sanitized: errors.length === 0 ? sanitized : undefined
    };
  }

  validateScanExplanation(data: unknown): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    
    if (!this.isObject(data)) {
      return { valid: false, errors: [{ field: 'root', message: 'Expected object', received: typeof data }], warnings: [] };
    }

    const sanitized: Record<string, unknown> = { ...data };

    const checkStringField = (field: string, minLength: number, maxLength: number) => {
      if (!this.hasField(data, field, 'string') || (data[field] as string).trim().length === 0) {
        errors.push({ field, message: `Missing or empty string field: ${field}`, received: data[field] });
      } else {
        const val = (data[field] as string).trim();
        if (val.length < minLength) {
          errors.push({ field, message: `Field ${field} is too short (min ${minLength})`, received: val.length });
        } else if (val.length > maxLength) {
          warnings.push({ field, message: `Field ${field} is too long (max ${maxLength})` });
          sanitized[field] = val.substring(0, maxLength);
        } else {
          sanitized[field] = val;
        }
      }
    };

    checkStringField('executiveSummary', 50, 1000);
    checkStringField('technicalSummary', 50, 1000);

    if (!this.hasField(data, 'topRisks', 'array')) {
      errors.push({ field: 'topRisks', message: 'Missing topRisks array', received: typeof data.topRisks });
    } else {
      const topRisks = data.topRisks as any[];
      if (topRisks.length < 1 || topRisks.length > 5) {
        errors.push({ field: 'topRisks', message: 'Length must be between 1 and 5', received: topRisks.length });
      }
      sanitized.topRisks = [...topRisks].sort((a, b) => (a.rank || 0) - (b.rank || 0));
    }

    if (!this.hasField(data, 'overallHealthAssessment', 'string') || !(data.overallHealthAssessment as string).toLowerCase().trim().startsWith('this pipeline')) {
      errors.push({ field: 'overallHealthAssessment', message: 'Must start with "This pipeline"', received: data.overallHealthAssessment });
    }

    if (!this.hasField(data, 'prioritizedActionPlan', 'array')) {
      errors.push({ field: 'prioritizedActionPlan', message: 'Missing prioritizedActionPlan array', received: typeof data.prioritizedActionPlan });
    } else {
      const plan = data.prioritizedActionPlan as any[];
      if (plan.length < 1 || plan.length > 10) {
        errors.push({ field: 'prioritizedActionPlan', message: 'Length must be between 1 and 10', received: plan.length });
      }
      sanitized.prioritizedActionPlan = [...plan].sort((a, b) => (a.priority || 0) - (b.priority || 0));
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      sanitized: errors.length === 0 ? sanitized : undefined
    };
  }

  validateAIPatchResult(data: unknown): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    
    if (!this.isObject(data)) {
      return { valid: false, errors: [{ field: 'root', message: 'Expected object', received: typeof data }], warnings: [] };
    }

    if (!this.hasField(data, 'patchedContent', 'string') || (data.patchedContent as string).trim().length === 0) {
      errors.push({ field: 'patchedContent', message: 'Missing or empty patchedContent', received: data.patchedContent });
    } else {
      const content = data.patchedContent as string;
      if (content.length > 5000) {
        errors.push({ field: 'patchedContent', message: 'patchedContent exceeds 5000 chars', received: content.length });
      }
      if (content.includes('YOUR_COMMAND_HERE') || content.includes('REPLACE_WITH') || content.includes('TODO:')) {
        errors.push({ field: 'patchedContent', message: 'AI generated placeholder text instead of real fix', received: content });
      }
      if (content.match(/^'.*'$/m)) {
        warnings.push({ field: 'patchedContent', message: 'Potential hallucinated Python-style single quotes' });
      }
    }

    if (!this.hasField(data, 'explanation', 'string') || (data.explanation as string).trim().length === 0) {
      errors.push({ field: 'explanation', message: 'Missing explanation', received: data.explanation });
    } else if ((data.explanation as string).length > 300) {
      errors.push({ field: 'explanation', message: 'explanation exceeds 300 chars', received: (data.explanation as string).length });
    }

    if (!this.hasField(data, 'warnings', 'array')) {
      errors.push({ field: 'warnings', message: 'Missing warnings array', received: typeof data.warnings });
    }

    if (!this.hasField(data, 'requiresManualReview', 'boolean')) {
      errors.push({ field: 'requiresManualReview', message: 'Missing requiresManualReview', received: typeof data.requiresManualReview });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      sanitized: errors.length === 0 ? data : undefined
    };
  }

  validateFailurePrediction(data: unknown): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    
    if (!this.isObject(data)) {
      return { valid: false, errors: [{ field: 'root', message: 'Expected object', received: typeof data }], warnings: [] };
    }

    const sanitized: Record<string, unknown> = { ...data };

    if (!this.hasField(data, 'scanId', 'string')) {
      errors.push({ field: 'scanId', message: 'Missing scanId', received: data.scanId });
    }

    if (!this.hasField(data, 'predictions', 'array')) {
      errors.push({ field: 'predictions', message: 'Missing predictions', received: typeof data.predictions });
    } else {
      const preds = data.predictions as any[];
      if (preds.length > 20) {
        errors.push({ field: 'predictions', message: 'Too many predictions', received: preds.length });
      }
      sanitized.predictions = preds.filter(p => p.ruleId && p.ruleId.trim() !== '' && p.filePath && p.filePath.trim() !== '');
    }

    if (!this.hasField(data, 'overallRiskLevel', 'string') || !['critical', 'high', 'medium', 'low'].includes(data.overallRiskLevel as string)) {
      errors.push({ field: 'overallRiskLevel', message: 'Invalid risk level', received: data.overallRiskLevel });
    }

    if (!this.hasField(data, 'timeToFailureEstimate', 'string')) errors.push({ field: 'timeToFailureEstimate', message: 'Missing', received: null });
    if (!this.hasField(data, 'mostLikelyFailureScenario', 'string')) errors.push({ field: 'mostLikelyFailureScenario', message: 'Missing', received: null });
    if (!this.hasField(data, 'confidenceStatement', 'string')) errors.push({ field: 'confidenceStatement', message: 'Missing', received: null });

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      sanitized: errors.length === 0 ? sanitized : undefined
    };
  }


  private isObject(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
  }

  private hasField(obj: Record<string, unknown>, field: string, type: 'string' | 'number' | 'boolean' | 'array' | 'object'): boolean {
    if (!(field in obj)) return false;
    const val = obj[field];
    switch (type) {
      case 'string': return typeof val === 'string';
      case 'number': return typeof val === 'number';
      case 'boolean': return typeof val === 'boolean';
      case 'array': return Array.isArray(val);
      case 'object': return typeof val === 'object' && val !== null && !Array.isArray(val);
      default: return false;
    }
  }
}

export const outputValidator = new OutputValidator();
