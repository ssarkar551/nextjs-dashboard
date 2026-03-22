"use server";
import { z } from "zod/v4";
import postgres from "postgres";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { AuthError } from "next-auth";

const sql = postgres(process.env.POSTGRES_URL!, { ssl: "require" });

const FormSchema = z.object({
	id: z.string(),
	customerId: z.preprocess(
		(val) => val ?? "",
		z.string().min(1, { message: "Please select a customer" }),
	),
	amount: z.coerce
		.number()
		.gt(0, { message: "Please select an amount greater than $0 " }),
	status: z.enum(["pending", "paid"], {
		message: "Please select an invoice status",
	}),
	date: z.string(),
});

const CreateInvoice = FormSchema.omit({ id: true, date: true });
const UpdateInvoice = FormSchema.omit({ id: true, date: true });

export type State = {
	errors?: {
		customerId?: string[];
		amount?: string[];
		status?: string[];
	};
	message?: string | null;
    formData?: {
        customerId?: string;
		amount?: string;
		status?: string;
    }
};

export async function createInvoice(prevState: State, formData: FormData) {
	const validatedFields = CreateInvoice.safeParse({
		customerId: formData.get("customerId"),
		amount: formData.get("amount"),
		status: formData.get("status"),
	});

	if (!validatedFields.success) {
		return {
			errors: validatedFields.error.flatten().fieldErrors,
			message: "Missing Fields. Failed to Create Invoice",
			formData: {
				customerId: String(formData.get("customerId")),
				amount: String(formData.get("amount")),
				status: String(formData.get("status")),
			},
		};
	}

	const { customerId, amount, status } = validatedFields.data;
	const amountInCents = amount * 100;
	const date = new Date().toISOString().split("T")[0];
	try {
		await sql`
            INSERT INTO invoices (customer_id, amount, status, date)
            VALUES (${customerId}, ${amount}, ${status}, ${date})`;
	} catch (e) {
		console.error("Error creating invoice: ", e);
		return {
			message: "Database Error: Failed to Create Invoice.",
		};
	}

	revalidatePath("/dashboard/invoices");
	redirect("/dashboard/invoices");
}

export async function updateInvoice(id: string, prevState: State, formData: FormData) {
	const validatedFields = UpdateInvoice.safeParse({
		customerId: formData.get("customerId"),
		amount: formData.get("amount"),
		status: formData.get("status"),
	});
    if(!validatedFields.success){
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: 'Missing fields. Failed to update invoice',
            formData: {
                customerId: String(formData.get("customerId") ?? ""),
				amount: String(formData.get("amount") ?? ""),
				status: String(formData.get("status") ?? ""),
            } 
        }
    }
    const { customerId, amount, status } = validatedFields.data
	const amountInCents = amount * 100;
	try {
		await sql`
        UPDATE invoices
        SET customer_id = ${customerId}, amount = ${amountInCents}, status = ${status}
        WHERE id = ${id}`;
	} catch (e) {
		console.error("Error updating invoice: ", e);
		return { message: "Database Error: Failed to Update Invoice." };
	}
	revalidatePath("/dashboard/invoices");
	redirect("/dashboard/invoices");
}

export async function deleteInvoice(id: string) {
	try {
		await sql`DELETE FROM invoices WHERE id = ${id}`;
	} catch (e) {
		console.error("Error deleting invoice: ", e);
		return { message: "Database Error: Failed to Delete Invoice." };
	}
	revalidatePath("dashboard/invoices");
}

export async function authenticate(
    prevState: string | undefined,
    formData: FormData
){
    try{
        await signIn('credentials', formData);
    } catch(error){
        if(error instanceof AuthError){
            switch(error.type){
                case 'CredentialsSignin':
                    return 'Invalid Credentials. ';
                default:
                    return 'Something went wrong';
            }
        }
        throw error;
    }
}
