const { z } = require("zod");

const propertyCategories = ["apartment", "villa", "commercial", "residential", "plot", "house", "penthouse"];

const createPropertySchema = z.object({
  title: z.string().min(5, "Title must be at least 5 characters").max(150).trim(),
  description: z.string().max(3000).trim().optional(),
  listingType: z.enum(["for_sale", "for_rent"], { errorMap: () => ({ message: "listingType must be for_sale or for_rent" }) }),
  category: z.enum(propertyCategories, {
    errorMap: () => ({ message: "Invalid category" }),
  }),
  price: z.number({ invalid_type_error: "Price must be a number" }).min(0),
  currency: z.string().default("PKR"),
  address: z.string().trim().optional(),
  city: z.string().min(1, "City is required").trim(),
  area: z.string().trim().optional(),
  coordinates: z.object({
    lat: z.number(),
    lng: z.number(),
  }).optional(),
  location: z.object({
    type: z.literal("Point").default("Point"),
    coordinates: z.tuple([
      z.number().min(-180).max(180),
      z.number().min(-90).max(90),
    ]),
  }).optional(),
  size: z.number().min(1).optional(),
  beds: z.number().min(0).optional(),
  baths: z.number().min(0).optional(),
  kitchens: z.number().min(0).optional(),
  attachedBathrooms: z.number().min(0).optional(),
  parking: z.number().min(0).default(0),
  floors: z.union([z.string().trim(), z.number().transform(String)]).optional(),
  yearBuilt: z.number().min(1900).max(new Date().getFullYear()).optional(),
  amenities: z.array(z.string().trim()).default([]),
  featured: z.boolean().optional(),
  images: z.array(z.object({
    url: z.string().url("Invalid image URL"),
    publicId: z.string().optional(),
    isCover: z.boolean().default(false),
  })).default([]),
});

const updatePropertySchema = createPropertySchema.partial();

const approvePropertySchema = z.object({
  action: z.enum(["approve", "reject"], { errorMap: () => ({ message: "action must be approve or reject" }) }),
  rejectionReason: z.string().trim().optional(),
}).refine(
  (d) => d.action === "approve" || (d.action === "reject" && d.rejectionReason),
  { message: "rejectionReason is required when rejecting", path: ["rejectionReason"] }
);

const dealPropertySchema = z.object({
  action: z.enum(["sold", "rented", "closed", "available"], { errorMap: () => ({ message: "action must be sold, rented, closed or available" }) }),
});

const featuredReviewSchema = z.object({
  action: z.enum(["approve", "reject"], { errorMap: () => ({ message: "action must be approve or reject" }) }),
  rejectionReason: z.string().trim().optional(),
  notes: z.string().trim().optional(),
}).refine(
  (d) => d.action === "approve" || (d.action === "reject" && d.rejectionReason),
  { message: "rejectionReason is required when rejecting", path: ["rejectionReason"] }
);

const propertyQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(50).default(20),
  city: z.string().trim().optional(),
  area: z.string().trim().optional(),
  category: z.enum(propertyCategories).optional(),
  listingType: z.enum(["for_sale", "for_rent"]).optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  beds: z.coerce.number().min(0).optional(),
  minSize: z.coerce.number().min(0).optional(),
  maxSize: z.coerce.number().min(0).optional(),
  sort: z.enum(["newest", "oldest", "price_asc", "price_desc"]).default("newest"),
  featured: z.coerce.boolean().optional(),
  areaSize: z.string().trim().optional(),
});

const mapSearchQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(500).default(250),
  north: z.coerce.number().min(-90).max(90),
  south: z.coerce.number().min(-90).max(90),
  east: z.coerce.number().min(-180).max(180),
  west: z.coerce.number().min(-180).max(180),
  city: z.string().trim().optional(),
  phase: z.string().trim().optional(),
  area: z.string().trim().optional(),
  category: z.enum(propertyCategories).optional(),
  propertyType: z.enum(propertyCategories).optional(),
  listingType: z.enum(["for_sale", "for_rent"]).optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  beds: z.coerce.number().min(0).optional(),
  minSize: z.coerce.number().min(0).optional(),
  maxSize: z.coerce.number().min(0).optional(),
});

module.exports = {
  createPropertySchema,
  updatePropertySchema,
  approvePropertySchema,
  dealPropertySchema,
  featuredReviewSchema,
  propertyQuerySchema,
  mapSearchQuerySchema,
};
