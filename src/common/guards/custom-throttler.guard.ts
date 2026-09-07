import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express'; // ✅ Import Express types for strict casting

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  // Keep the 'any' here ONLY because the base class forces this exact signature
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected getTracker(req: Record<string, any>): Promise<string> {
    // Safely cast the loose 'any' object to a strict Express Request
    const request = req as unknown as Request;

    const forwardedFor = request.headers['x-forwarded-for'];

    // Handle if it is a single string (Standard Nginx behavior)
    if (typeof forwardedFor === 'string') {
      return Promise.resolve(forwardedFor.split(',')[0].trim());
    }

    // Handle if it is an array of strings (Some load balancers do this)
    if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
      return Promise.resolve(forwardedFor[0].trim());
    }

    // Fallback to direct IP, wrapped in Promise.resolve() to fix the async error
    return Promise.resolve(request.ip || 'unknown-ip');
  }
}
