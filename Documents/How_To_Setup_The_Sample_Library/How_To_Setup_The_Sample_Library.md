# How To Setup The Sample Library

In this document we cover how to add the sample library to your development environment and set up the applications that allow you to use the samples.

> If you still do not have a development enviroment, contact the Developer Relations team at the Partner Support Portal at [partnersupport.iqgeo.com](partnersupport.iqgeo.com) and we can help you.

## Table of Contents

- [How To Setup The Sample Library](#how-to-setup-the-sample-library)
  - [Table of Contents](#table-of-contents)
  - [Adding the Sample Library](#adding-the-sample-library)
  - [Registering Sample Applications](#registering-sample-applications)
  - [**Troubleshooting \& Tips**](#troubleshooting--tips)

---

## Adding the Sample Library

To add the sample library to your environment:

1. **Clone the Repository**
   - Clone the [utils-devrel-samples Repository](https://github.com/IQGeo/utils-devrel-samples/tree/main) directly into the root directory of your development environment (i.e.: at the same level as your custom folder)
  
2. **Verify Directory Structure**
   - Confirm that a `utils-devrel-samples` directory appears at the root, alongside the `custom` folder, containing the repository contents.
  
3. **Update the `iqgeorc.jsonc` file**
    - Add the Samples module and any required dependencies to your iqgeorc.jsonc file under the modules section. It should resemble: 
    ```
    //...
    "modules": [
    // Other modules...
    {
        "name": "utils-devrel-samples"
    }
    ],
    //...
    ```

    > Always use the latest module versions. Refer to the [Modules Dependencies](https://github.com/IQGeo/utils-project-template/wiki/Module-dependencies) page for up-to-date version info.

4. **Apply Configuration Changes**
    - Right-click on `iqgeorc.jsonc` in VS Code's "Explorer" panel
    - Select **“IQGeo: Update Project from .iqgeorc.jsonc”**
        > **Important**: Ensure your working tree is clean before running the update command

5. **Rebuild the Container**
   - Once the container is rebuilt, configuration options for the sample application will become available on the "Configuration" page

## Registering Sample Applications

To access and use the sample applications on your platform:

1. **Add Application to Platform**
   - Navigate to Configurations → Applications → Add New
   - Enter your preferred Name, Display Name, and Description
   - In the JavaScript File field, enter: `modules/utils-devrel-samples/js/main.nmt_samples.js`
   - Enable:
     - Available Online
     - Available in Native App
     - Choose a relevant Basemap or Basemaps
     - For Overlays, select all except those beginning with `comsof`
     - Enable Snapping for:
       - Addresses
       - mywcom_cables
       - mywcom_equipment
       - mywcom_structures
   - Save the configuration
> For additional sample application files, repeat these steps and adjust as needed using their respective file names

2. **Set Application Permissions**
   - Return to the main page by clicking the IQGeo logo
   - Go to Configurations → Roles
   - Select the user group needing access
   - Find and enable devrel_samples_app
   - Grant full permissions for the application
   - Save changes

3. **Verify Application Availability**
   - Upon returning to the main page, the Samples Application icon should appear, indicating successful setup and availability for authorized users

## **Troubleshooting & Tips**
   - Ensure the correct directory structure before running any platform commands.
   - Always reference the module dependency page for up-to-date versioning.
   - For further support, contact the Developer Relations team at the Partner Support Portal at [partnersupport.iqgeo.com](partnersupport.iqgeo.com)