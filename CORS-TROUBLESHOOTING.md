# CORS Troubleshooting Guide

## Quick Diagnosis

## Quick Diagnosis


   ```bash
   lsof -i :8105
3. **Te
   curl -v -H "Origin: http
      


   ```bash
- **Cause:** Service not running or not acc
   ```

3. **Test CORS specifically:**
   ```bash
   curl -v -H "Origin: http://localhost:3000" \
        -H "Access-Control-Request-Method: GET" \
        -H "Access-Control-Request-Headers: Content-Type" \
        -X OPTIONS \
        http://localhost:8105/api/v3.0/application-configurations/host-environment
   ```

## Common CORS Errors

### "Failed to fetch" or "Network Error"
- **Cause:** Service not running or not accessible
- **Solution:** Start your Data Services API or check the URL

### "CORS policy: No 'Access-Control-Allow-Origin' header"
- **Cause:** Server doesn't send CORS headers
- **Solution:** Add CORS middleware to your server

### "CORS policy: Request header field content-type is not allowed"
- **Cause:** Server doesn't allow Content-Type header
- **Solution:** Add Content-Type to allowed headers

## Server Configuration Examples

### Express.js (Node.js)
    public Co
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization');
  
  // Handle preflight OPTIONS requests
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {

  }
});
@cr

### ASP.NET Core
### 1. Te
// In Startup.cs ConfigureServices method
```
{
    options.AddDefaultPolicy(builder =>
    {
google-chrome --disable-web-secu
# Windows
```
⚠️ **Wa
###

cors-anywhere



1. Enable CORS in the 
3. Conf
   - `Access-Control-Allow-

```javascript
    // Your logic here
 

            'Ac
        },
    };
```
### Nginx Reverse Proxy
server {
    
        # CORS headers
        add_header 'Access-Control-Allow-Methods' 'GET, POST
        
        
            add_header 'Content-Type' 'text/plain; charset=utf-8';
            return 204;
        
    }
`
## 

- **Production:*
### Heade
- Overly permissive header 


```bash

### Test Environmen
curl -v http://localhost:8105/api/v

```bash
```
### Test CORS
curl -v -X OPTIONS \
   



2. Look for failed requests (
   - **Failed to fetch:** Network/connecti
```bash
## Common Port Issues
```

netstat -an | grep :8105

```
### Kill Process on Port 8105
# Linux

for /f "tokens=5" %a in ('netstat -aon ^| findstr :8105') do taskkill 

# Windows
1. Check the browser console for detailed error messages
```







cors-anywhere















```javascript

    // Your logic here







        },

    };

```

### Nginx Reverse Proxy

server {

    

        # CORS headers



        



            add_header 'Content-Type' 'text/plain; charset=utf-8';

            return 204;

        

    }

















```bash




```bash

```








curl -v -X OPTIONS \















## Common Port Issues





netstat -an | grep :8105



```

### Kill Process on Port 8105











1. Check the browser console for detailed error messages


